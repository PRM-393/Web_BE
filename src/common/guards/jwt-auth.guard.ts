import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Bao ve endpoint bang JWT access token (Authorization: Bearer <token>) - NFR-SEC-03
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
