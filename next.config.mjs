/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export para o Electron carregar os arquivos localmente em produção
  output: 'export',
  // Desabilita otimização de imagens (não funciona em export estático)
  images: { unoptimized: true },
  // Em produção o Electron carrega via file://, então assets precisam de paths relativos
  assetPrefix: process.env.NODE_ENV === 'production' ? '.' : '',
  trailingSlash: true,
}

export default nextConfig
