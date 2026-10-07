import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MediaResponseDto {
  @ApiProperty({ example: '66f1c0d9e4b0a1b2c3d4e5f7' })
  id: string;

  @ApiProperty({ example: '66f1c0c4e4b0a1b2c3d4e5f6' })
  ownerId: string;

  @ApiProperty({ example: 'holiday.jpg' })
  fileName: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty({ example: 482133, description: 'Size in bytes' })
  size: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({
    description: 'Presigned url to show the image (works in <img src>)',
  })
  url: string;

  @ApiProperty({ description: 'Presigned url that downloads the file' })
  downloadUrl: string;

  @ApiProperty({ description: 'Both urls stop working after this time' })
  urlExpiresAt: Date;

  @ApiPropertyOptional({
    type: [String],
    description: 'Users that can view this image, only shown to the owner',
  })
  allowedUserIds?: string[];
}

export class MediaListResponseDto {
  @ApiProperty({ type: [MediaResponseDto] })
  items: MediaResponseDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;
}
