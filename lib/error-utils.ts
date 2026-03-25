/** Mensagem segura para exibir ao usuário a partir de um erro desconhecido. */
export function getErrorMessage(error: unknown, fallback = 'Erro desconhecido.'): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}
