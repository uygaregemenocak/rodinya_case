import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import path from 'node:path';
import type { AuthUser } from '@common/auth-user.js';
import { BucketPolicies } from '@storage/bucket-policies.js';
import { ObjectStorage } from '@storage/object-storage.js';
import { UrlPresigner } from '@storage/url-presigner.js';
import { UsersService } from '@users/users.service.js';
import {
  MediaListResponseDto,
  MediaResponseDto,
} from './dto/media-response.dto.js';
import { PermissionsResponseDto } from './dto/permissions-response.dto.js';
import { PermissionAction } from './dto/update-permission.dto.js';
import { canAccessMedia } from './media-permissions.js';
import { Media, MEDIA_BUCKET, MediaRecord } from './schemas/media.schema.js';
import { UploadedMediaFile } from './upload/media-storage.engine.js';
import {
  getContentDisposition,
  sanitizeFileName,
} from './utils/file-name.utils.js';

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectModel(Media.name) private readonly mediaModel: Model<Media>,
    private readonly storage: ObjectStorage,
    private readonly presigner: UrlPresigner,
    private readonly usersService: UsersService,
    private readonly bucketPolicies: BucketPolicies,
  ) {}

  onModuleInit() {
    // presigned urls for the media bucket follow the same rules as the API
    this.bucketPolicies.setReadCheck(MEDIA_BUCKET, (userId, key) =>
      this.canUserViewFile(userId, key),
    );
  }

  // Runs on every presigned url request, so removing someone's access works
  // right away. Both lookups are by _id, so they are cheap.
  async canUserViewFile(userId: string, key: string): Promise<boolean> {
    if (!isValidObjectId(userId)) {
      return false;
    }

    // keys look like "<ownerId>/<mediaId>.jpg"
    const mediaId = path.posix.basename(key, '.jpg');

    const [media, user] = await Promise.all([
      this.findById(mediaId),
      this.usersService.findById(userId),
    ]);

    if (!media || media.filePath !== key) {
      throw new NotFoundException('File not found');
    }
    if (!user) {
      return false;
    }

    const viewer: AuthUser = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    };
    return canAccessMedia(viewer, media, 'view');
  }

  async findById(id: string): Promise<MediaRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }
    return this.mediaModel.findById(id).lean<MediaRecord>().exec();
  }

  // The file is already on disk at this point (multer storage engine).
  async create(owner: AuthUser, file: UploadedMediaFile): Promise<MediaRecord> {
    try {
      const media = await this.mediaModel.create({
        _id: new Types.ObjectId(file.mediaId),
        ownerId: new Types.ObjectId(owner.id),
        fileName: sanitizeFileName(file.originalname),
        filePath: file.key,
        mimeType: 'image/jpeg',
        size: file.size,
      });
      return media.toObject<MediaRecord>();
    } catch (error) {
      // don't leave a file behind that no record points to
      await this.storage.deleteObject(MEDIA_BUCKET, file.key).catch(() => {});
      throw error;
    }
  }

  findMyMedia(user: AuthUser, page: number, limit: number) {
    const filter = { ownerId: new Types.ObjectId(user.id) };
    return this.findPaginated(filter, user, page, limit);
  }

  findSharedWithMe(user: AuthUser, page: number, limit: number) {
    const filter = { allowedUserIds: new Types.ObjectId(user.id) };
    return this.findPaginated(filter, user, page, limit);
  }

  async delete(media: MediaRecord): Promise<void> {
    // Delete the record first. If deleting the file fails after that we only
    // end up with an unused file, not a record pointing to a missing file.
    const deleted = await this.mediaModel.findByIdAndDelete(media._id).exec();
    if (!deleted) {
      throw new NotFoundException('Media not found');
    }

    try {
      await this.storage.deleteObject(MEDIA_BUCKET, media.filePath);
    } catch (error) {
      this.logger.error(`Could not delete file ${media.filePath}`, error);
    }
  }

  async getPermissions(media: MediaRecord): Promise<PermissionsResponseDto> {
    const users = await this.usersService.findEmailsByIds(media.allowedUserIds);

    const emails = new Map<string, string>();
    for (const user of users) {
      emails.set(user._id.toString(), user.email);
    }

    const allowedUsers = [];
    for (const userId of media.allowedUserIds) {
      const email = emails.get(userId.toString());
      // skip users that were deleted in the meantime
      if (email) {
        allowedUsers.push({ id: userId.toString(), email });
      }
    }

    return {
      mediaId: media._id.toString(),
      ownerId: media.ownerId.toString(),
      allowedUsers,
    };
  }

  async updatePermission(
    media: MediaRecord,
    userId: string,
    action: PermissionAction,
  ): Promise<PermissionsResponseDto> {
    if (media.ownerId.equals(userId)) {
      throw new BadRequestException('Owner already has access to their media');
    }

    if (action === 'add') {
      const userExists = await this.usersService.exists(userId);
      if (!userExists) {
        throw new NotFoundException('User not found');
      }
    }

    // $addToSet / $pull are atomic, so two requests at the same time
    // can't overwrite each other's changes
    const target = new Types.ObjectId(userId);
    const update =
      action === 'add'
        ? { $addToSet: { allowedUserIds: target } }
        : { $pull: { allowedUserIds: target } };

    const updated = await this.mediaModel
      .findByIdAndUpdate(media._id, update, { returnDocument: 'after' })
      .lean<MediaRecord>()
      .exec();
    if (!updated) {
      throw new NotFoundException('Media not found');
    }

    return this.getPermissions(updated);
  }

  toResponse(media: MediaRecord, user: AuthUser): MediaResponseDto {
    // the urls are signed for this user, they stop working if they lose access
    const viewUrl = this.presigner.presignGetObject(
      MEDIA_BUCKET,
      media.filePath,
      {
        userId: user.id,
        contentDisposition: getContentDisposition(media.fileName, 'inline'),
      },
    );
    const downloadUrl = this.presigner.presignGetObject(
      MEDIA_BUCKET,
      media.filePath,
      {
        userId: user.id,
        contentDisposition: getContentDisposition(media.fileName, 'attachment'),
      },
    );

    const response: MediaResponseDto = {
      id: media._id.toString(),
      ownerId: media.ownerId.toString(),
      fileName: media.fileName,
      mimeType: media.mimeType,
      size: media.size,
      createdAt: media.createdAt,
      url: viewUrl.url,
      downloadUrl: downloadUrl.url,
      urlExpiresAt: viewUrl.expiresAt,
    };

    // only the owner should see who else has access
    if (media.ownerId.equals(user.id)) {
      response.allowedUserIds = media.allowedUserIds.map((id) => id.toString());
    }

    return response;
  }

  private async findPaginated(
    filter: Record<string, unknown>,
    user: AuthUser,
    page: number,
    limit: number,
  ): Promise<MediaListResponseDto> {
    const [items, total] = await Promise.all([
      this.mediaModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<MediaRecord[]>()
        .exec(),
      this.mediaModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((media) => this.toResponse(media, user)),
      page,
      limit,
      total,
    };
  }
}
