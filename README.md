# RADAR LOCAL PRO

**Encontre negócios. Identifique oportunidades. Conquiste clientes.**

🔗 **Acesse:** https://lzdeveloperbr.github.io/RadarproBR/

Plataforma de prospecção comercial que encontra estabelecimentos em qualquer cidade do Brasil, analisa a presença digital de cada um, classifica oportunidades de 0 a 100 e oferece CRM, Kanban, agenda, propostas em PDF, gerador de prompts para sites/apps (Lovable), mensagens comerciais e relatórios.

**100% gratuito e sem cadastro:** abra o link e use. Não precisa de conta, servidor nem chave de API.

## Como funciona

| Parte | Como é feito (grátis) |
|---|---|
| Pesquisa de estabelecimentos | OpenStreetMap — Overpass API + Nominatim, direto do navegador |
| Mapa | Leaflet + OpenStreetMap/CARTO, com agrupamento e cores por presença digital |
| Banco de dados | IndexedDB do navegador (cada pessoa tem seus próprios dados) |
| Análise digital | Classificação site próprio × rede social × diretório, teste de HTTPS e checklist do conteúdo |
| PDF, Excel, CSV | Gerados no próprio aparelho |
| Hospedagem | GitHub Pages (deploy automático pelo GitHub Actions a cada push na `main`) |
| App instalável | PWA (manifest, service worker, ícones) |

### Análise de presença digital
- Instagram, Facebook e diretórios **nunca** contam como site próprio.
- O teste de disponibilidade verifica se o site responde com **HTTPS** a partir do navegador.
- Navegadores não permitem ler o conteúdo de outros sites; por isso a ficha tem um **checklist** (WhatsApp, endereço, mapa, agendamento, cardápio, versão para celular...). Ao preencher, a pontuação é recalculada com fatos verificados por você.
- Status usa “Site não identificado”, nunca “não possui site”. Motivos marcados como **fato verificado** ou **estimativa**.

### Seus dados
Ficam salvos apenas no navegador. Em **Dados e backup** você pode baixar um backup (.json), restaurar em outro aparelho e proteger o armazenamento contra limpeza automática.

### Limitações
- O OpenStreetMap é colaborativo: comércios não cadastrados não aparecem e não há notas/avaliações.
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
