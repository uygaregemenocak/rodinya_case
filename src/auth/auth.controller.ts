import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@common/decorators/public.decorator.js';
import { ErrorResponseDto } from '@common/swagger/error-response.dto.js';
import { AuthService } from './auth.service.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';

// stricter than the global limit, to slow down password guessing
const AUTH_RATE_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@ApiBadRequestResponse({
  type: ErrorResponseDto,
  description: 'Validation error',
})
@ApiTooManyRequestsResponse({
  type: ErrorResponseDto,
  description: 'Too many requests',
})
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle(AUTH_RATE_LIMIT)
  @ApiOperation({ summary: 'Create an account' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Email already registered',
  })
  register(
    @Body() dto: RegisterDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.register(dto.email, dto.password, userAgent);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_RATE_LIMIT)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Wrong email or password',
  })
  login(@Body() dto: LoginDto, @Headers('user-agent') userAgent?: string) {
    return this.authService.login(dto.email, dto.password, userAgent);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a new token pair',
    description:
      'Refresh tokens are single use. Using an old one again revokes the session.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Invalid, expired or already used refresh token',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the session of a refresh token' })
  @ApiNoContentResponse({ description: 'Logged out' })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Invalid or expired refresh token',
  })
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }
}
