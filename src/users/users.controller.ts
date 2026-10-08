import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '@common/auth-user.js';
import { CurrentUser } from '@common/decorators/current-user.decorator.js';
import { ErrorResponseDto } from '@common/swagger/error-response.dto.js';
import { toUserResponse, UserResponseDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: ErrorResponseDto,
  description: 'Missing or invalid access token',
})
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the logged in user' })
  @ApiOkResponse({ type: UserResponseDto })
  async getMe(@CurrentUser() currentUser: AuthUser): Promise<UserResponseDto> {
    const user = await this.usersService.getById(currentUser.id);
    return toUserResponse(user);
  }
}
