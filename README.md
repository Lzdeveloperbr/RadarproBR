# RADAR LOCAL PRO

**Encontre negócios. Identifique oportunidades. Conquiste clientes.**

Plataforma SaaS de prospecção comercial: pesquisa estabelecimentos reais em qualquer cidade do Brasil (Google Places API), investiga a presença digital de cada um (site próprio, funcionamento, HTTPS, celular, localização publicada, WhatsApp, agendamento, cardápio...), classifica oportunidades de 0 a 100 e oferece CRM, Kanban, propostas em PDF, gerador de prompts para sites/apps (Lovable) e IA comercial.

> Nenhum resultado é simulado. Quando uma integração não está configurada, o sistema informa exatamente o que falta.

## 🚀 Publicação 100% gratuita (GitHub Pages + Supabase Free + OpenStreetMap)

Site: **https://lzdeveloperbr.github.io/RadarproBR/**

| Parte | Serviço gratuito |
|---|---|
| Site (frontend + PWA) | GitHub Pages |
| Banco, login, Edge Functions | Supabase — plano Free |
| Pesquisa de estabelecimentos | OpenStreetMap (Overpass API + Nominatim) — sem chave |
| Mapa | Leaflet + OpenStreetMap/CARTO — sem chave |
| PDF, Excel, CSV, prompts Lovable | gerados no próprio app |
| Opcionais (pagos/cota) | Google Places, busca na web, IA Claude |

**Passo a passo (uma vez só):**
1. **GitHub Pages:** *Settings → Pages → Build and deployment → Source: GitHub Actions*.
2. **Supabase:** crie um projeto grátis em supabase.com. Anote o *Project ref* (Project Settings → General), a *senha do banco* e gere um *Access token* em supabase.com/dashboard/account/tokens.
3. **Repositório → Settings → Secrets and variables → Actions:**
   - *Secrets*: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`
   - *Variables*: `SUPABASE_PROJECT_REF`, `VITE_SUPABASE_URL` (https://REF.supabase.co), `VITE_SUPABASE_ANON_KEY` (chave anon/publishable — pública)
4. Faça um push na `main` (ou rode o workflow *Deploy* manualmente). O GitHub Actions aplica o banco, publica as funções e o site.
5. No Supabase, em *Authentication → URL Configuration*, coloque `https://lzdeveloperbr.github.io/RadarproBR/` como *Site URL* e adicione `https://lzdeveloperbr.github.io/RadarproBR/**` em *Redirect URLs*.

Se as variáveis `VITE_SUPABASE_*` não forem definidas, o site abre uma tela para colar a URL e a chave pública do Supabase (salvas no navegador).

**Sobre a fonte gratuita (OpenStreetMap):** é usada automaticamente quando não há chave do Google. Comércios que não estão cadastrados no mapa colaborativo não aparecem, e não há avaliações/nota. Para forçar uma fonte: `supabase secrets set SEARCH_PROVIDER=osm` (ou `google`). Na tela de pesquisa também é possível escolher.


## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4, Lucide, Recharts, dnd-kit, TanStack Query |
| Mapas | Google Maps JS (se `VITE_GOOGLE_MAPS_BROWSER_KEY`) ou Leaflet + OpenStreetMap, com agrupamento |
| Backend | Supabase (Postgres + Auth + RLS + Realtime) e Edge Functions (Deno) |
| Integrações | OpenStreetMap (gratuito), Google Places API (New) + Geocoding (opcional), Brave Search ou Google Programmable Search (opcional), Anthropic Claude (opcional) |
| Exportação | CSV, Excel (SheetJS), PDF (jsPDF) |
| PWA | vite-plugin-pwa (manifest, service worker, ícones, atalhos) |

## Estrutura

```
src/
  components/      UI reutilizável (ui/, layout/, business/, MapView, FilterPanel, BusinessList...)
  hooks/           useAuth (sessão/org), useBatchRunner (fila persistente), useFavorites
  lib/             supabase, api (Edge Functions), filtros, exportação, PDF, gerador de prompt, modelos de proposta
  pages/           20+ telas (login, dashboard, pesquisa, resultados, mapa, ficha, análise, CRM, kanban...)
supabase/
  migrations/      esquema completo com RLS, índices, triggers e funções SQL
  functions/
    _shared/       módulos: places, websearch, safeFetch (SSRF), robots, htmlAnalysis, scoring, ai, usage...
    search-places/ pesquisa real no Google Places + deduplicação + persistência
    audit-business/investigação de presença digital e pontuação
    ai-assistant/  relatórios, argumentos, mensagens, e-mails, propostas e prompts com IA
    integrations-status/ status/teste real das integrações e consumo
    site-monitor/  verificação periódica de disponibilidade dos sites
    admin-members/ convites e permissões
  tests/           stub do Supabase + teste de RLS em Postgres
tests/             testes unitários (vitest) da análise, SSRF, robots, pontuação e prompt
```

## Instalação

### 1. Supabase
```bash
npm install
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push                      # aplica supabase/migrations
npx supabase functions deploy             # publica todas as Edge Functions
```

### 2. Segredos das Edge Functions (backend — nunca no frontend)
```bash
npx supabase secrets set GOOGLE_MAPS_API_KEY=...        # Places API (New) + Geocoding API habilitadas
npx supabase secrets set BRAVE_SEARCH_API_KEY=...       # OU: GOOGLE_CSE_API_KEY=... GOOGLE_CSE_CX=...
npx supabase secrets set ANTHROPIC_API_KEY=...          # IA (modelo padrão: claude-opus-5-5)
npx supabase secrets set ALLOWED_ORIGINS=https://app.seudominio.com.br SITE_URL=https://app.seudominio.com.br
```
Veja `supabase/functions/.env.example` para todos os parâmetros (limites de uso incluídos).

### 3. Frontend
```bash
cp .env.example .env.local   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173
npm run build                # gera dist/ (PWA)
```

### 4. Autenticação
Em *Authentication → URL Configuration*, cadastre a URL do app e `.../redefinir-senha` como Redirect URLs (recuperação de senha e convites).

### 5. Monitoramento periódico de sites (opcional)
Defina `CRON_SECRET` e agende no SQL Editor (extensões `pg_cron` e `pg_net`):
```sql
select cron.schedule('radar-site-monitor', '0 */6 * * *', $$
  select net.http_post(
    url := 'https://SEU-PROJETO.supabase.co/functions/v1/site-monitor',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','SEU_CRON_SECRET'),
    body := '{"limit":100,"older_than_hours":24}'::jsonb);
$$);
```

## Como funciona a investigação digital

1. **Pesquisa** (`search-places`): geocodifica a localidade, consulta a Text Search por categoria (até 3 páginas; acima de 60 resultados divide a área em grade), descarta resultados fora do raio e fechados definitivamente, e salva sem duplicar (`place_id` + chave nome/telefone/coordenada). Cria leads automaticamente.
2. **Análise** (`audit-business`):
   - Classifica cada link: *site próprio*, *rede social*, *diretório*, *marketplace* ou *não identificado*. Instagram/Facebook/diretórios **nunca** contam como site próprio.
   - Sem site no Google e com busca na web configurada, pesquisa o nome + cidade e **só aceita** um candidato se a página contiver o nome **e** o telefone ou a cidade.
   - Respeita `robots.txt`, bloqueia IPs privados/hosts internos (SSRF), revalida redirecionamentos, limita tamanho e tempo.
   - Lê a página inicial e até 3 páginas internas (contato, localização, cardápio...) procurando endereço, CEP, coordenadas, mapa incorporado, link do Maps, botão "como chegar", telefone, WhatsApp, formulário, cardápio, agendamento, serviços, galeria, redes sociais e horários — sempre registrando a evidência.
   - O status "Site não identificado" é usado em vez de "não possui site".
3. **Classificação** (`scoring.ts`): pontuação 0–100, nível alta/média/baixa e motivos separados em **fato verificado** e **estimativa**.

## Segurança e LGPD
- Row Level Security em todas as tabelas; cada usuário só acessa dados das organizações de que é membro (testado em `supabase/tests/rls_test.sql`).
- Chaves de API apenas como segredos das Edge Functions; o frontend usa somente a chave pública (anon).
- Rate limiting por organização e provedor (por minuto e por dia), registro de consumo em `api_usage`, logs em `activity_logs`.
- Validação de entrada, sanitização (React escapa HTML; tooltips do mapa escapam `<`), proteção contra injeção de fórmulas no CSV.
- Apenas dados comerciais públicos; exclusão de estabelecimento na ficha; exportação dos dados do usuário no perfil.

## Testes
```bash
npm test                    # vitest: análise HTML, SSRF, robots.txt, pontuação, deduplicação, prompt
npm run typecheck           # TypeScript do frontend
npm run functions:check     # type-check das Edge Functions (Deno)
# RLS (Postgres em Docker):
docker run -d --name rlpg -e POSTGRES_PASSWORD=pw postgres:17-alpine
docker exec -i rlpg psql -U postgres < supabase/tests/auth_stub.sql
docker exec -i rlpg psql -U postgres < supabase/migrations/20261126000001_schema.sql
docker exec -i rlpg psql -U postgres < supabase/tests/rls_test.sql
```

## Limitações conhecidas
- A Text Search do Google retorna no máximo 60 resultados por consulta; coberturas maiores usam grade de sub-áreas (mais chamadas e custo).
- Sites que dependem inteiramente de JavaScript para exibir conteúdo podem ter menos evidências detectadas (a análise lê o HTML público).
- "Abre corretamente no celular" é avaliado pela presença de meta viewport responsiva e resposta HTTP válida (heurística, não renderização).
- A fila de lote é processada pelo navegador do usuário (estado persistido no banco: pode fechar e continuar depois).
