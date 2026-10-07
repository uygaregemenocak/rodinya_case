import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// JwtAuthGuard is global, routes marked with @Public() skip it
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
