import type { Locale } from "@dnw/schemas";

export type EmailKind = "verify" | "reset" | "already_registered";

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const COPY: Record<
  Locale,
  Record<EmailKind, { subject: string; intro: string; action: string; outro: string }>
> = {
  vi: {
    verify: {
      subject: "Xác minh email Da Nang World",
      intro: "Chào {name}, bấm vào liên kết dưới đây để xác minh email của bạn (hiệu lực 24 giờ).",
      action: "Xác minh email",
      outro: "Nếu bạn không đăng ký, hãy bỏ qua thư này.",
    },
    reset: {
      subject: "Đặt lại mật khẩu Da Nang World",
      intro: "Chào {name}, bấm vào liên kết dưới đây để đặt mật khẩu mới (hiệu lực 1 giờ).",
      action: "Đặt lại mật khẩu",
      outro: "Nếu bạn không yêu cầu, hãy bỏ qua thư này; mật khẩu của bạn không thay đổi.",
    },
    already_registered: {
      subject: "Email này đã có tài khoản Da Nang World",
      intro:
        "Chào {name}, có người vừa đăng ký Da Nang World bằng email này nhưng tài khoản đã tồn tại. Nếu là bạn, hãy đăng nhập hoặc đặt lại mật khẩu.",
      action: "Đăng nhập",
      outro: "Nếu không phải bạn, không cần làm gì.",
    },
  },
  en: {
    verify: {
      subject: "Verify your Da Nang World email",
      intro: "Hi {name}, open the link below to verify your email (valid for 24 hours).",
      action: "Verify email",
      outro: "If you did not sign up, ignore this message.",
    },
    reset: {
      subject: "Reset your Da Nang World password",
      intro: "Hi {name}, open the link below to set a new password (valid for 1 hour).",
      action: "Reset password",
      outro: "If you did not ask for this, ignore this message; your password is unchanged.",
    },
    already_registered: {
      subject: "This email already has a Da Nang World account",
      intro:
        "Hi {name}, someone just tried to sign up with this email but an account already exists. If it was you, log in or reset your password.",
      action: "Log in",
      outro: "If it was not you, no action is needed.",
    },
  },
};

const PATHS: Record<EmailKind, string> = {
  verify: "verify-email",
  reset: "reset-password",
  already_registered: "login",
};

export function renderEmail(opts: {
  kind: EmailKind;
  locale: Locale;
  name: string;
  baseUrl: string;
  token?: string;
}): EmailContent {
  const c = COPY[opts.locale][opts.kind];
  const url = new URL(`${opts.baseUrl}/${opts.locale}/${PATHS[opts.kind]}`);
  if (opts.token) url.searchParams.set("token", opts.token);
  const intro = c.intro.replace("{name}", opts.name);
  const text = `${intro}\n\n${url.toString()}\n\n${c.outro}\n`;
  const html = `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(url.toString())}">${escapeHtml(c.action)}</a></p><p>${escapeHtml(c.outro)}</p>`;
  return { subject: c.subject, text, html };
}
