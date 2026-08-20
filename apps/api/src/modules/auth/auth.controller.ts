import { Body, Controller, Header, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { applicationConfig } from '../../config/applicationConfig';
import { AuthService } from './auth.service';
import { ApiLogin } from './auth.swagger';
import { LoginRequestDto } from './dto/loginRequest.dto';
import { LoginResponseDto } from './dto/loginResponse.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  public constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiLogin()
  public async login(
    @Body() credentials: LoginRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const session = await this.authService.login(credentials);

    const { cookie, jwtExpiresInSeconds } = applicationConfig.auth;

    response.cookie(cookie.name, session.accessToken, {
      httpOnly: cookie.httpOnly,
      maxAge: jwtExpiresInSeconds * 1000,
      path: cookie.path,
      sameSite: cookie.sameSite,
      secure: cookie.secure,
    });

    return session.user;
  }
}
