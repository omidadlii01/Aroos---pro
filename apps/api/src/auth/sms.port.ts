export const SMS_PORT = Symbol('SMS_PORT');

export type SmsDelivery = 'sms' | 'dev-log';

export interface SmsPort {
  readonly delivery: SmsDelivery;
  sendOtp(input: { phone: string; code: string; expiresInSeconds: number }): Promise<void>;
}
