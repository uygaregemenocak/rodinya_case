import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { User, UserRecord } from './schemas/user.schema.js';

const MONGO_DUPLICATE_KEY_ERROR = 11000;

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(email: string, passwordHash: string): Promise<UserRecord> {
    try {
      const user = await this.userModel.create({ email, passwordHash });
      return user.toObject();
    } catch (error) {
      if ((error as { code?: number }).code === MONGO_DUPLICATE_KEY_ERROR) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  // only used by login, this is the one place we need the hash
  findByEmailWithPassword(email: string) {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .lean<UserRecord>()
      .exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).lean<UserRecord>().exec();
  }

  async getById(id: string): Promise<UserRecord> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async exists(id: string): Promise<boolean> {
    if (!isValidObjectId(id)) {
      return false;
    }
    const result = await this.userModel.exists({ _id: id });
    return result !== null;
  }

  async findEmailsByIds(ids: Types.ObjectId[]) {
    if (ids.length === 0) {
      return [];
    }
    return this.userModel
      .find({ _id: { $in: ids } }, { email: 1 })
      .lean<{ _id: Types.ObjectId; email: string }[]>()
      .exec();
  }
}
