import { z } from 'zod';

const email = z.string().trim().toLowerCase()
  .max(254, 'Email tối đa 254 ký tự.')
  .pipe(z.email('Nhập email hợp lệ.'));

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Nhập mật khẩu.').max(1024, 'Mật khẩu quá dài.'),
});

export const signUpCredentialsSchema = signInSchema.extend({
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự.').max(128, 'Mật khẩu tối đa 128 ký tự.'),
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(1, 'Nhập họ và tên.').max(100, 'Họ và tên tối đa 100 ký tự.'),
  dateOfBirth: z.iso.date('Nhập ngày sinh hợp lệ theo dạng YYYY-MM-DD.')
    .refine((date) => date >= '1900-01-01' && date < new Date().toISOString().slice(0, 10),
      'Ngày sinh phải từ năm 1900 và trong quá khứ.'),
});

export const verificationSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Nhập đủ 6 số từ email.'),
});

export type CredentialsForm = z.infer<typeof signInSchema>;
export type ProfileForm = z.infer<typeof profileSchema>;
export type VerificationForm = z.infer<typeof verificationSchema>;
