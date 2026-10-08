import { ApiProperty } from '@nestjs/swagger';
import { USER_ROLES, type UserRole } from '@common/auth-user.js';
import type { UserRecord } from '../schemas/user.schema.js';

export class UserResponseDto {
  @ApiProperty({ example: '66f1c0c4e4b0a1b2c3d4e5f6' })
  id: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;

  @ApiProperty({ enum: USER_ROLES, example: 'user' })
  role: UserRole;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export function toUserResponse(user: UserRecord): UserResponseDto {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
