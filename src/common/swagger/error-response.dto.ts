import { ApiProperty } from '@nestjs/swagger';

//only used for swagger docs
export class ErrorResponseDto {
  @ApiProperty({ example: 403 })
  statusCode: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'You do not have access to this media',
  })
  message: string | string[];

  @ApiProperty({ example: 'Forbidden' })
  error: string;
}
