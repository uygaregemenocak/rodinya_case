import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '@users/schemas/user.schema.js';

export const MEDIA_BUCKET = 'media';

@Schema({
  collection: 'media',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class Media {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  ownerId: Types.ObjectId;

  // original name from the upload, only used for Content-Disposition
  @Prop({ required: true })
  fileName: string;

  // Key of the file inside the media bucket: "<ownerId>/<mediaId>.jpg".
  // On disk that's <UPLOAD_DIR>/media/<filePath>.
  @Prop({ required: true })
  filePath: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true, min: 0 })
  size: number;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: User.name }],
    default: [],
  })
  allowedUserIds: Types.ObjectId[];

  createdAt: Date;
}

export type MediaDocument = HydratedDocument<Media>;
export type MediaRecord = Media & { _id: Types.ObjectId };

export const MediaSchema = SchemaFactory.createForClass(Media);

// The lists are sorted by createdAt and then _id, so both fields are in the
// index too. Otherwise mongo finds the documents with the index but still has
// to sort them in memory.

// for GET /media/my
MediaSchema.index({ ownerId: 1, createdAt: -1, _id: -1 });
// for GET /media/shared
MediaSchema.index({ allowedUserIds: 1, createdAt: -1, _id: -1 });
