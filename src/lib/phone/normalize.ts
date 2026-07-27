export class InvalidPhoneError extends Error {
  constructor(message = "Telefone inválido.") {
    super(message);
    this.name = "InvalidPhoneError";
  }
}

/** Normaliza telefones brasileiros para E.164 sem o sinal de +. */
export function normalizeBrazilianPhone(input: string): string {
  if (/[^\d\s()+-]/.test(input)) {
    throw new InvalidPhoneError();
  }

  const digits = input.replace(/\D/g, "").replace(/^0+/, "");

  if (!digits) {
    throw new InvalidPhoneError();
  }

  const nationalNumber = digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;

  if (!/^[1-9][0-9](?:[2-5][0-9]{7}|9[0-9]{8})$/.test(nationalNumber)) {
    throw new InvalidPhoneError();
  }

  return `55${nationalNumber}`;
}
