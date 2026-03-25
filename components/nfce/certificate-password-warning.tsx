/**
 * Aviso quando o certificado vem de arquivo .pfx e a senha ainda não foi informada.
 */
export function CertificatePasswordWarning({ context }: { context: 'listagem' | 'download' }) {
  return (
    <div
      className="mb-4 px-4 py-3 rounded flex items-center gap-3"
      style={{ background: 'var(--amber)', color: '#000', border: '1px solid var(--amber)' }}
      role="alert"
    >
      <span className="text-lg">⚠</span>
      <div>
        <p className="font-medium">Senha do certificado não informada</p>
        {context === 'listagem' ? (
          <p className="text-sm opacity-90">
            Com arquivo .pfx, a senha é obrigatória. Vá na aba <strong>Certificado</strong>, informe a senha e clique
            em Verificar antes de buscar.
          </p>
        ) : (
          <p className="text-sm opacity-90">
            Com arquivo .pfx, a senha é obrigatória. Vá na aba <strong>Certificado</strong>, informe a senha e clique
            em Verificar antes de baixar.
          </p>
        )}
      </div>
    </div>
  )
}
