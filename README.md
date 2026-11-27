# RADAR LOCAL PRO

**Encontre negócios. Identifique oportunidades. Conquiste clientes.**

🔗 **Acesse:** https://lzdeveloperbr.github.io/RadarproBR/

Plataforma de prospecção comercial que encontra estabelecimentos em qualquer cidade do Brasil, analisa a presença digital de cada um, classifica oportunidades de 0 a 100 e oferece CRM, Kanban, agenda, propostas em PDF, gerador de prompts para sites/apps (Lovable), mensagens comerciais e relatórios.

**Sem cadastro:** abra o link e use. Sem conta e sem servidor. A pesquisa gratuita usa o OpenStreetMap; para encontrar **muito mais** estabelecimentos (com notas e avaliações), ative o **Google Places** (opcional).

## Como funciona

| Parte | Como é feito (grátis) |
|---|---|
| Pesquisa de estabelecimentos | **OpenStreetMap** (sempre) **+ TomTom** (grátis, sem cartão) **+ Google Places** (opcional), resultados unidos sem duplicar |
| Mapa | Leaflet + OpenStreetMap/CARTO, com agrupamento e cores por presença digital |
| Banco de dados | IndexedDB do navegador (cada pessoa tem seus próprios dados) |
| Análise digital | Classificação site próprio × rede social × diretório, teste de HTTPS e checklist do conteúdo |
| PDF, Excel, CSV | Gerados no próprio aparelho |
| Hospedagem | GitHub Pages (deploy automático pelo GitHub Actions a cada push na `main`) |
| App instalável | PWA (manifest, service worker, ícones) |

### TomTom (gratuita, sem cartão — recomendada)
Base comercial de estabelecimentos com telefone e site. O plano gratuito não pede cartão e, ao passar do limite, as consultas são bloqueadas em vez de cobradas.

1. Crie uma conta em [developer.tomtom.com](https://developer.tomtom.com/) e copie a chave (API Key) do painel.
2. Para todos que abrirem o site: GitHub → *Settings → Secrets and variables → Actions → Variables* → crie `VITE_TOMTOM_API_KEY` e rode o workflow *Deploy*. (Ou cole em **Configurações → Fontes de dados** para usar só no seu navegador.)

### Google Places (opcional — a mais completa, exige cartão)
O Google Maps tem a base mais completa de comércios do Brasil. Com a chave configurada, cada pesquisa consulta o **Google e o OpenStreetMap juntos**: o mesmo estabelecimento nas duas fontes vira um só (telefone igual ou nome parecido a menos de 150 m), e os dados se completam.

1. Em [console.cloud.google.com](https://console.cloud.google.com/), crie um projeto e ative o faturamento (há uso gratuito mensal; o Google pede cartão).
2. Ative **Maps JavaScript API** e **Places API (New)**.
3. Crie uma **chave de API** com restrição de **sites** para `https://lzdeveloperbr.github.io/*` e restrição de APIs às duas acima.
4. Em **Cotas**, limite as solicitações por dia para não passar do uso gratuito.
5. Para todos que abrirem o site: GitHub → *Settings → Secrets and variables → Actions → Variables* → crie `VITE_GOOGLE_MAPS_BROWSER_KEY` com a chave e rode o workflow *Deploy*. (Ou cole a chave em **Configurações → Fontes de dados** para usar só no seu navegador.)

A chave de navegador fica visível no código da página — por isso a restrição de domínio e as cotas são obrigatórias.

### Análise de presença digital
- Instagram, Facebook e diretórios **nunca** contam como site próprio.
- O teste de disponibilidade verifica se o site responde com **HTTPS** a partir do navegador.
- Navegadores não permitem ler o conteúdo de outros sites; por isso a ficha tem um **checklist** (WhatsApp, endereço, mapa, agendamento, cardápio, versão para celular...). Ao preencher, a pontuação é recalculada com fatos verificados por você.
- Status usa “Site não identificado”, nunca “não possui site”. Motivos marcados como **fato verificado** ou **estimativa**.

### Seus dados
Ficam salvos apenas no navegador. Em **Dados e backup** você pode baixar um backup (.json), restaurar em outro aparelho e proteger o armazenamento contra limpeza automática.

### Limitações
- Sem Google, a cobertura depende do OpenStreetMap (colaborativo): comércios não cadastrados não aparecem e não há notas/avaliações.
- Os dados não sincronizam entre aparelhos automaticamente (use o backup).
- A fila de pesquisa em lote só avança com o app aberto.

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes (motor de análise, OpenStreetMap e fluxo completo com IndexedDB)
npm run build      # gera dist/ (PWA)
```

Estrutura: `src/lib/engine` (OpenStreetMap, classificação, pontuação), `src/lib/services.ts` (pesquisa, análise, monitoramento), `src/lib/db.ts` (IndexedDB/Dexie), `src/pages` (telas), `src/components` (UI).

Dados de mapa © colaboradores do OpenStreetMap (ODbL).
