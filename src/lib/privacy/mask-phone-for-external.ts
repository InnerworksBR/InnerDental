/**
 * Mascara o telefone para envio a provedores externos (OpenAI, etc).
 * Preserva os últimos 4 dígitos para correlação de logs; colapsa apenas
 * entradas inválidas (vazio / tamanho < 12 dígitos BR) para um placeholder
 * único — ao contrário do `maskPhone` administrativo, que colapsa tudo
 * < 5 chars para '••••' para esconder até o tail.
 *
 * Mantido em arquivo separado para evitar acoplamento entre a máscara
 * de exibição (admin) e a máscara de privacidade externa (LLM).
 */
export function maskPhoneForExternal(phone: string): string {
  const tail = phone.slice(-4);
  if (!/^\d{4}$/.test(tail)) return "invalid-phone";
  return `${"•".repeat(Math.max(0, phone.length - 4))}${tail}`;
}