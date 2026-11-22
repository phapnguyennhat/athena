import { Matches } from 'class-validator';

export class AvatarUploadDto {
  /** Send to `PUT /auth/me/avatar` once the upload finished. */
  key: string;
  /** `PUT` the JPEG here with `Content-Type: image/jpeg`. Valid 5 minutes. */
  uploadUrl: string;
  /** Larger files are rejected when the key is confirmed. */
  maxBytes: number;
}

export class SetAvatarDto {
  /** The `key` from `POST /auth/me/avatar/upload-url`. */
  @Matches(/^avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/)
  key: string;
}
