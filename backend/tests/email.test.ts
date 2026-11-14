import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../src/config";
import { createVerificationMailer } from "../src/mobile/email";

const { createTransport, sendMail } = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock("nodemailer", () => ({ default: { createTransport } }));

const sender = "accounts@example.com";
const recipient = "new@example.com";
const apiKey = "test-only-brevo-key";
const smtpUrl = "smtps://user%40example.com:pass%2Fword@smtp.example.com:465";
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  createTransport.mockReturnValue({ sendMail });
  sendMail.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("email provider configuration", () => {
  it.each([
    ["unset variables", {}],
    ["empty variables", { BREVO_API_KEY: "", SMTP_URL: "", EMAIL_FROM: "" }],
  ] satisfies [string, NodeJS.ProcessEnv][])(
    "keeps registration optional with %s",
    async (_name, env) => {
      expect(await createVerificationMailer(parseConfig(env))).toBeUndefined();
      expect(createTransport).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["Brevo", { BREVO_API_KEY: apiKey, EMAIL_FROM: sender }],
    ["SMTP", { SMTP_URL: smtpUrl, EMAIL_FROM: sender }],
    [
      "both with Brevo precedence",
      { BREVO_API_KEY: apiKey, SMTP_URL: smtpUrl, EMAIL_FROM: sender },
    ],
  ] satisfies [string, NodeJS.ProcessEnv][])(
    "accepts complete %s settings",
    (_name, env) => {
      expect(parseConfig({ NODE_ENV: "production", ...env })).toMatchObject(
        env,
      );
    },
  );

  it.each([
    ["sender without provider", { EMAIL_FROM: sender }],
    ["Brevo without sender", { BREVO_API_KEY: apiKey }],
    ["SMTP without sender", { SMTP_URL: smtpUrl }],
    [
      "both providers without sender",
      { BREVO_API_KEY: apiKey, SMTP_URL: smtpUrl },
    ],
    [
      "empty key without another provider",
      { BREVO_API_KEY: "", EMAIL_FROM: sender },
    ],
    ["blank key", { BREVO_API_KEY: "  ", EMAIL_FROM: sender }],
    [
      "key with header injection",
      { BREVO_API_KEY: "key\r\nx-test: value", EMAIL_FROM: sender },
    ],
    ["invalid sender", { BREVO_API_KEY: apiKey, EMAIL_FROM: "invalid" }],
    [
      "display name instead of sender address",
      { BREVO_API_KEY: apiKey, EMAIL_FROM: "Accounts <accounts@example.com>" },
    ],
    [
      "incorrect SMTP scheme",
      { SMTP_URL: "https://smtp.example.com", EMAIL_FROM: sender },
    ],
    ["SMTP without a host", { SMTP_URL: "smtp://", EMAIL_FROM: sender }],
    [
      "malformed SMTP credential",
      { SMTP_URL: "smtp://user:bad%ZZ@smtp.example.com", EMAIL_FROM: sender },
    ],
    [
      "invalid unused SMTP provider",
      { BREVO_API_KEY: apiKey, SMTP_URL: "invalid", EMAIL_FROM: sender },
    ],
  ] satisfies [string, NodeJS.ProcessEnv][])("rejects %s", (_name, env) => {
    expect(() => parseConfig(env)).toThrow();
  });
});

describe("Brevo verification mailer", () => {
  it("sends the verification message over HTTPS with a bounded request", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"messageId":"test-id"}', { status: 201 }),
    );
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const mailer = await createVerificationMailer(
      parseConfig({
        BREVO_API_KEY: apiKey,
        EMAIL_FROM: sender,
      }),
    );
    await expect(mailer!(recipient, "123456")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: { email: sender },
          to: [{ email: recipient }],
          subject: "Investing Hub email verification",
          textContent:
            "Your verification code is 123456. It expires in 10 minutes.",
        }),
        signal: expect.any(AbortSignal),
        redirect: "error",
      },
    );
    expect(timeout).toHaveBeenCalledWith(10000);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("prefers Brevo when SMTP is also configured", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    const mailer = await createVerificationMailer(
      parseConfig({
        BREVO_API_KEY: apiKey,
        SMTP_URL: smtpUrl,
        EMAIL_FROM: sender,
      }),
    );
    await mailer!(recipient, "123456");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it.each([302, 400, 401, 403, 429, 500, 503])(
    "rejects HTTP %i without retrying, leaking the payload or sending via SMTP",
    async (status) => {
      const response = new Response("sensitive-provider-payload", { status });
      fetchMock.mockResolvedValue(response);
      const mailer = await createVerificationMailer(
        parseConfig({
          BREVO_API_KEY: apiKey,
          SMTP_URL: smtpUrl,
          EMAIL_FROM: sender,
        }),
      );
      await expect(mailer!(recipient, "123456")).rejects.toThrow(
        "Email provider rejected the request.",
      );
      expect(response.bodyUsed).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(createTransport).not.toHaveBeenCalled();
    },
  );

  it("aborts a stalled HTTPS request", async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => realTimeout(10));
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          const signal = options!.signal!;
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const mailer = await createVerificationMailer(
      parseConfig({
        BREVO_API_KEY: apiKey,
        EMAIL_FROM: sender,
      }),
    );
    await expect(mailer!(recipient, "123456")).rejects.toMatchObject({
      name: "TimeoutError",
    });
    expect(timeout).toHaveBeenCalledWith(10000);
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("propagates network errors to the auth service", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const mailer = await createVerificationMailer(
      parseConfig({
        BREVO_API_KEY: apiKey,
        EMAIL_FROM: sender,
      }),
    );
    await expect(mailer!(recipient, "123456")).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("SMTP verification mailer regression", () => {
  it.each([
    ["smtp://smtp.example.com", 587, false],
    ["smtp://smtp.example.com:2525", 2525, false],
    ["smtps://smtp.example.com", 465, true],
  ])("preserves TLS and timeouts for %s", async (url, port, secure) => {
    const mailer = await createVerificationMailer(
      parseConfig({
        SMTP_URL: url,
        EMAIL_FROM: sender,
      }),
    );
    await mailer!(recipient, "123456");
    expect(createTransport).toHaveBeenCalledExactlyOnceWith({
      host: "smtp.example.com",
      port,
      secure,
      requireTLS: true,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
    expect(sendMail).toHaveBeenCalledExactlyOnceWith({
      from: sender,
      to: recipient,
      subject: "Investing Hub email verification",
      text: "Your verification code is 123456. It expires in 10 minutes.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("decodes SMTP credentials and treats an empty Brevo key as unset", async () => {
    const mailer = await createVerificationMailer(
      parseConfig({
        BREVO_API_KEY: "",
        SMTP_URL: smtpUrl,
        EMAIL_FROM: sender,
      }),
    );
    await mailer!(recipient, "123456");
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { user: "user@example.com", pass: "pass/word" },
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates SMTP delivery errors to the auth service", async () => {
    sendMail.mockRejectedValue(new Error("SMTP unavailable"));
    const mailer = await createVerificationMailer(
      parseConfig({
        SMTP_URL: smtpUrl,
        EMAIL_FROM: sender,
      }),
    );
    await expect(mailer!(recipient, "123456")).rejects.toThrow(
      "SMTP unavailable",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
