import { ApiProperty } from '@nestjs/swagger';

export class AllowedUserDto {
  @ApiProperty({ example: '66f1c0c4e4b0a1b2c3d4e5f6' })
  id: string;

  @ApiProperty({ example: 'friend@example.com' })
  email: string;
}

export class PermissionsResponseDto {
  @ApiProperty({ example: '66f1c0d9e4b0a1b2c3d4e5f7' })
  mediaId: string;

  @ApiProperty({ example: '66f1c0c4e4b0a1b2c3d4e5f6' })
  ownerId: string;

  @ApiProperty({ type: [AllowedUserDto] })
  allowedUsers: AllowedUserDto[];
}
