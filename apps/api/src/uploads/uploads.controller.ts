import {
  Controller, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  MAX_AVATAR_BYTES, MAX_UPLOAD_BYTES, UploadedFileLike, UploadsService,
} from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file', {
    // Buffered rather than streamed to disk, so nothing is written until the
    // magic bytes have been checked.
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  }))
  upload(@UploadedFile() file: UploadedFileLike) {
    return this.uploads.save(file);
  }

  /**
   * Avatar upload, open to any signed-in user.
   *
   * Separate from the admin route rather than relaxing it: this one has its own
   * tighter size cap, and keeping them apart means a future change to admin
   * uploads cannot silently widen what employees may write.
   */
  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  }))
  avatar(@UploadedFile() file: UploadedFileLike) {
    return this.uploads.save(file, MAX_AVATAR_BYTES);
  }

  /**
   * Serves a stored image.
   *
   * Deliberately unauthenticated: an <img> tag cannot carry a bearer token.
   * Access rests on the 128-bit random filename, so a URL is effectively
   * unguessable but *is* shareable by anyone who already has it — the same
   * bargain as any signed-URL-less CDN object. Nothing sensitive belongs here.
   */
  @Get(':tenantDir/:fileName')
  async serve(
    @Param('tenantDir') tenantDir: string,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    const { path, mime } = await this.uploads.locate(tenantDir, fileName);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // The name is random and the type is verified, but a browser that sniffs
    // its way to something else would undo that check.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    createReadStream(path).pipe(res);
  }
}
