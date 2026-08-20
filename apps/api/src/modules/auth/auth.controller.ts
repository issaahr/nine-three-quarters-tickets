import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { applicationConfig } from '../../config/applicationConfig';
import { AuthenticatedUser } from './auth.types';
import { AuthService } from './auth.service';
import { ApiGetSession, ApiLogin, ApiLogout } from './auth.swagger';
import { Auth } from './decorators/auth.decorator';
import { LoginRequestDto } from './dto/loginRequest.dto';
import { LoginResponseDto } from './dto/loginResponse.dto';
import { SessionResponseDto } from './dto/sessionResponse.dto';

interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

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

  @Get('session')
  @Header('Cache-Control', 'no-store')
  @Auth()
  @ApiGetSession()
  public getSession(@Req() request: AuthenticatedRequest): SessionResponseDto {
    return request.user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiLogout()
  public logout(@Res({ passthrough: true }) response: Response): void {
    const { cookie } = applicationConfig.auth;

    response.clearCookie(cookie.name, {
      httpOnly: cookie.httpOnly,
      path: cookie.path,
      sameSite: cookie.sameSite,
      secure: cookie.secure,
    });
  }
}
