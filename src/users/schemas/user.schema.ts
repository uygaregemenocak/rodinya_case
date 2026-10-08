import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { UserRole } from '@common/auth-user.js';

@Schema({ collection: 'users', timestamps: true, versionKey: false })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  // select: false so the hash never comes back unless we ask for it
  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ type: String, enum: ['user', 'admin'], default: 'user' })
  role: UserRole;

  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;
export type UserRecord = User & { _id: Types.ObjectId };

export const UserSchema = SchemaFactory.createForClass(User);
