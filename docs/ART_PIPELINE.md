# Plano de Arte — Spritesheets profissionais via SpriteCook

Objetivo: substituir a arte procedural por spritesheets autorais **sem sair
do 16-bit** (SNES-era, gótico), sem quebrar nenhum invariante de
`docs/ARCHITECTURE.md` §15 e mantendo o fallback procedural sempre vivo.

**Status:** Fase 0 concluída (pipeline pronto). Fase 1 concluída — Skeleton
ativo. **Fase 2 do herói completa** — todos os sets humanos via SpriteCook
(mesmo `character_id`): idle, walk, jump (+fall reusa mid-air), attack,
attackUp, crouch, crouchAttack, backdash, hurt, die. Ver §5.2. Assinatura
"adventurer" confirmada em 2026-08-04; rota Grok Imagine testada e
descartada (ver §5.3).

---

## 1. O que o engine já impõe (restrições não-negociáveis)

Levantado do código, não de suposição:

| Fato | Origem | Consequência para a arte |
| --- | --- | --- |
| Resolução fixa **480×270**, escala inteira | `src/engine/renderer.ts:1` | Arte é autorada em pixel nativo. Nada de downscale em runtime, nada de meio-pixel. |
| `TILE = 16` | `src/gfx/tiles.ts:4` | Todo cenário em grid de 16. |
| 14 `TileId` × 2 zonas (`castle`, `tower`), com variantes por tile | `src/gfx/tiles.ts` | O tileset do jogo **não é autotile por bitmask** — é por papel semântico (Brick, FloorTop, Platform, PillarTop/Mid/Base, BgWall, BgWindow, Cracked, Gate, Water, WaterTop, Door). |
| Sprite é desenhado **centro-horizontal + base alinhada ao hitbox** | `skeleton.ts:51`, `candle.ts:47`, `pickup.ts:91` | Se os frames de uma animação tiverem alturas/larguras diferentes, o personagem "flutua" e escorrega. **Caixa de frame uniforme por set é obrigatória.** |
| Só frames virados para a **direita**; o engine espelha | `assets.ts:123` (`sheetToFacingSet`) | Nunca gerar frames à esquerda. Metade do custo. |
| Override de asset é opcional e tolerante a falha | `assets.ts:63` | Podemos migrar sprite a sprite, sem big bang. |
| Caches de sprite inicializados no construtor | AGENTS.md | O manifest precisa estar carregado **antes** do primeiro `new Game()`. Já é o caso (`loadAssets()` no boot). |
| Paleta única em `PAL` | `src/gfx/palette.ts` | A arte gerada precisa ser **quantizada para PAL**, senão o jogo vira colcha de retalhos. |

### 1.1 Lacunas do pipeline atual (a fechar antes de gerar arte)

O layer de override do Phase 9 é um protótipo. Hoje ele:

- aceita **só tira horizontal de linha única**, sem âncora, sem trim, sem
  multi-animação por arquivo (`SheetEntry = {file, frameW, frameH, frames}`);
- está ligado em **apenas 7 chaves**: `skeleton.walk`, `bat.fly`,
  `fishman.walk`, `axeKnight.walk`, `ghost.idle`, `demon.idle`,
  `shopkeeper.idle`. **Player, Zombie, SpearGuard, FleaMan, Wraith,
  MedusaHead, Dracula, BoneColossus, velas, pickups, portraits e tiles não
  têm caminho de override nenhum**;
- não tem override de **tileset** (`buildTileset` é sempre procedural);
- não tem nenhuma validação — um PNG com paleta errada ou anti-aliasing
  entra no jogo silenciosamente.

Sem fechar essas lacunas, gerar arte é desperdício de crédito.

---

## 2. Restrição dura: orçamento de créditos

Estado da conta SpriteCook hoje: **40 créditos, tier `free`, 1 job
concorrente**.

Custos reais da API (consultados agora):

| Rota | Custo |
| --- | --- |
| `generate_game_art` — gpt-image-2 `quality:low` 1K | **2 créditos/imagem** |
| `generate_game_art` — gemini-2.5-flash / 3.1-flash-lite 1K | 8 |
| `generate_game_art` — gemini-3.1-flash 1K (default) | 12 |
| `generate_game_art` — gemini-3-pro 1K | 16 |
| `generate_character` (base do workflow) | 12 |
| `generate_character_animations` — por animação (bg `basic`) | 20 |
| Prep de pose (walk/run) dentro do workflow | +12 cada |

Consequências:

- **Pack completo de personagem** (base + prep walk + idle/walk/jump/attack/
  hurt/death) = 12 + 12 + 6×20 = **144 créditos**. Um único personagem
  custa 3,6× o saldo atual.
- Os 40 créditos dão para **exatamente uma fatia vertical**: ~1 style bible
  + 1 inimigo completo pela rota barata, ou 1 personagem-base + 1 animação.
- Estimativa do art pass completo, rota híbrida (§5), com fator de iteração
  2× que sempre acontece na prática: **700–900 créditos**.

**Decisão do usuário necessária:** ou (a) rodamos a Fase 0+1 dentro dos 40
créditos como prova de conceito e só depois se decide sobre top-up, ou
(b) top-up antes de começar e executamos o plano inteiro. O plano abaixo
está ordenado para que (a) seja um resultado útil e auto-contido.

---

## 3. Style bible — a peça que faz a diferença entre "profissional" e "asset flip"

Coerência visual não vem de prompts bons repetidos; vem de **uma referência
travada**. A ordem importa:

1. Gerar **uma** folha-referência ("style bible"): o herói em idle + um
   esqueleto + um bloco de parede, na mesma imagem, mesma iluminação, mesma
   rampa de cor.
2. Iterar essa folha na rota barata (gpt-image-2 `low`, 2 créditos) até
   aprovar. **Só ela** consome iteração.
3. Fazer upload dela como asset (`create_asset_upload` →
   `finalize_asset_upload`) e usar o ID em **`style_asset_ids` de todas as
   gerações seguintes** (aceita até 10 imagens de estilo).
4. Salvar como preset privado (`save_private_preset`) para reuso.

Parâmetros travados em toda geração:

```
pixel: true
colors: [<as cores de PAL relevantes ao asset>]
bg_mode: "transparent"
smart_crop: false          # nosso packer faz o trim; o deles quebra o baseline
style: "16-bit SNES sprite, side view, hard 1px edges, no anti-aliasing,
        no dithering gradients, flat cel shading, violet-shifted shadows"
theme: "gothic dark fantasy castle, Castlevania SotN"
```

**`colors` é só orientação, não trava nada** — na prática o modelo devolve o
que quiser (o teste da Fase 1 voltou com pedra cinza neutra em vez da rampa
violeta pedida). `force_colors`/`force_enabled`, que forçam de verdade, só
existem em `generate_tileset`. Para sprites, quem garante a paleta é a
quantização OKLab do nosso pipeline — por isso ela não é opcional.

### Limitações honestas do gerador (planejar em cima delas, não contra)

- **Nenhum modelo suporta transparência nativa** (`supports_transparency:
  false` em todos). O fundo transparente sai de pós-processamento — as
  bordas vêm com alpha parcial e halo. Nosso pós-processo **precisa** fazer
  threshold binário de alpha.
- O output vem em resolução alta e é "pixelizado" por pós-processo. Em
  sprites de 32px de altura, boa parte da fidelidade se perde no downscale.
  A regra realista: **IA gera o concept/base; o passo de limpeza em 32px é
  semi-manual** (script de quantização + revisão olho a olho). Sem esse
  passo, o resultado parece "pixel art de IA", não 16-bit.
- `generate_tileset` só produz **autotile por bitmask** (16/15/17 peças). O
  jogo usa papéis semânticos. Portanto tileset entra como **material**
  (`mode:"texture"`), fatiado à mão para os 14 `TileId`.
- `auto_slice_asset` corta por alpha conectado — perde a baseline comum
  entre poses. Nosso packer precisa realinhar pelos pés.

---

## 4. Arquitetura do pipeline

```
SpriteCook (gera)
   └─> assets-src/raw/<nome>.png        (baixado, intocado, versionado)
        └─> tools/process-sprites.ts     (o coração do pipeline)
             ├─ threshold de alpha (binário, sem AA)
             ├─ quantização para PAL (nearest em OKLab, não RGB)
             ├─ trim por conteúdo + realinhamento por pés
             ├─ pad para caixa de frame uniforme do set
             └─ empacota tira horizontal, frames right-facing
                  └─> public/assets/<nome>.png + manifest.json
                       └─> tools/validate-assets.ts  (gate de QA)
                            └─> engine (assets.ts → resolveSpriteSet)
```

Regras:

- `assets-src/` (raw da IA) é versionado e **nunca** consumido em runtime —
  reprocessar tem de ser determinístico e grátis.
- `public/assets/` é 100% saída de script. Nada editado à mão lá.
- Todo o pós-processo é Node + `canvas`/`sharp`, sem dependência nova em
  runtime do jogo.

### 4.1 Manifest v2 (compatível com o v1) — **implementado**

`SheetEntry` ganhou três campos opcionais cujos defaults reproduzem o v1
exatamente, então não há versionamento condicional no loader:

```jsonc
{
  "version": 2,
  "sheets": {
    "skeleton.walk": {
      "file": "skeleton.png",
      "frameW": 16, "frameH": 32, "frames": 4,
      "row": 0,        // linha dentro do PNG (várias animações por arquivo)
      "anchorX": 8,    // coluna que cai no centro do hitbox (default frameW/2)
      "anchorY": 32    // linha dos pés (default frameH)
    }
  }
}
```

A âncora é **assada no frame** em tempo de load (`assets.ts` desloca o
conteúdo), porque as entidades desenham centro-x + base — não há como
expressar âncora de outro jeito sem tocar em toda entidade. O que sai da
caixa é cortado, e o validador reprova nesse caso.

`durations` (ticks por frame) foi **deixado de fora de propósito**: o timing
vive em cada entidade (`animTick / 14`), e adicionar o campo sem ligá-lo
criaria configuração morta. Entra quando/se o timing for centralizado.

### 4.2 Registro de frames — a decisão que evita tremor

Descoberto na prática ao rodar o pipeline pela primeira vez: alinhar cada
frame pelo próprio bounding box faz o corpo escorregar de lado quando a
silhueta muda (pernas fechando), e **empurra para o chão** um frame de pé
erguido. Daí o campo `registration`:

- `"shared"` — um único offset para o set inteiro, calculado pela união dos
  frames. Preserva o movimento relativo que o artista desenhou. Exige todos
  os frames na mesma tela; é o default quando a fonte é uma grade.
- `"per-frame"` — cada frame recortado e reancorado sozinho. É a única saída
  quando os frames vêm de gerações separadas, onde o enquadramento de cada
  canvas é ruído e não intenção. Custa até 1px de tremor.

Regra prática: **registro é trabalho do autor; o pipeline preserva, não
inventa.** Peça frames em grade ao gerador sempre que possível.

### 4.3 Cobertura de `resolveSpriteSet` — **implementado**

O hook agora cobre tudo que era procedural puro:

- `player.*` — precisa de um `resolvePlayerSprites()` próprio, porque
  `PlayerSprites` é um objeto de 7 sets (idle, walk, jump, attack, crouch,
  backdash, + formas bat/wolf), não um `SpriteSet`.
- `zombie.walk`, `spearGuard.walk`, `fleaMan.hop`, `wraith.float`,
  `medusaHead.fly`, `dracula.*`, `boss.walk`, `boss.windup`.
- `candle.lit`, `candle.broken`, `pickup.*`, `subweapon.*`, `bone.*`,
  `interactable.relic|warp|save`, `portrait.*`.
- `tileset.<zone>.<TileId>` via novo `resolveTileset(zone)` em `tiles.ts`.

Cada um mantém o builder procedural como fallback — invariante preservado.

---

## 5.1 Resultado da Fase 1 (16 créditos gastos, 24 restantes)

Teste executado: style bible (2 variações, gpt-image-2 `low`, 4 créditos) +
base do herói pelo workflow de personagem (`generate_character`, 12 créditos).
Ambos passados pelo pipeline até o tamanho nativo do jogo e olhados a 1×.

**O que funciona — esqueleto, 20×32:** silhueta limpa, pernas separadas,
pose de caminhada legível, 3 cores de PAL. Igual ou melhor que o procedural.
Aprovado e ativo no manifest.

**O herói, 40×36 — reprovado na 1ª rodada, aprovado na 2ª.** A base gerada é
boa a 152px; reduzi-la 4,4× até 34px falhou até que dois problemas nossos
fossem corrigidos:

| Rodada | Configuração | Resultado |
| --- | --- | --- |
| 1 | Paleta restrita às 11 cores do herói, redução por box filter | Massa escura sem contraste interno; some contra `stoneMid` |
| 1 | PAL inteira (21 cores), box filter | Lê um pouco melhor, mas puxa a rampa verde da torre — herói verde-oliva, e 21 cores é ruído demais |
| 2 | Meio-tons novos na rampa + box filter | Rosto ganha estrutura, espada lê; ainda mole |
| 2 | Meio-tons novos + **redução por maioria** | Rosto legível, lâmina e guarda distintas, dourado como acento, silhueta separa da parede |

As duas correções, nenhuma delas culpa do gerador:

1. **Buraco na rampa do herói.** Medindo a luminância OKLab: a paleta ia
   `pants` 0.36 → `bladeEdge` 0.66 sem nenhum degrau, e **15% dos pixels da
   arte gerada caíam nesse vão**, sendo empurrados para um dos extremos. Daí
   `skinShade`, `linen`, `coatMid` e `coatLight` em `palette.ts` — escolhidos
   com croma que a rampa da pedra não tem, para o herói separar da parede por
   matiz e não só por brilho. A pele, aliás, não tinha **nenhum** tom de
   sombra antes disso.
2. **Média borra, voto preserva.** O box filter suaviza toda aresta e entrega
   ao quantizador uma papa. Quantizar primeiro e reduzir por **voto de
   maioria** (`resize.mode: "majority"`) mantém aresta dura — é a diferença
   entre "arte de IA reduzida" e pixel art. Foi a alavanca decisiva, maior que
   a da paleta.

**Régua para escolher a rota, por asset:** contraste e simplicidade de
silhueta no tamanho final. Assunto claro sobre fundo escuro (ossos, fantasmas,
chamas, pedra iluminada) passa fácil com `box`; figura escura e detalhada
precisa de `majority` + rampa sem buracos. Quando um asset sair mole, o
diagnóstico é sempre o mesmo: medir o histograma OKLab e procurar o vão.

**Nada disso foi ativado no jogo.** Ambos os testes são pose única — o herói
alternaria idle de IA com caminhada procedural, e o esqueleto perderia o ciclo
de 2 frames. As receitas ficam em `assets-src/sprites.config.json` com
`"enabled": false` e a arte-base paga em `assets-src/raw/`, prontas para
quando houver o set de animação completo. O que este teste entregou foi
conhecimento e ferramenta, não arte pronta.

### Dois bugs que o teste desenterrou

- **Override com menos frames que o procedural derrubava o desenho.** As
  entidades indexam frames por posição (`set[1]` no bob do idle), então um
  sheet de 1 frame entregava `undefined` ao `drawImage`, o erro subia no meio
  do `Game.draw` e levava jogador e HUD junto. `resolveSprites.ts` agora
  completa o set repetindo o último frame: degrada para pose parada em vez de
  quebrar. A camada de override só cumpre a promessa de "nunca quebra o jogo"
  com esse ajuste.
- **O service worker servia arte velha.** `public/sw.js` era cache-first para
  tudo, inclusive `/assets/`. Em desenvolvimento isso mascara qualquer
  rebuild; **em produção significa que uma atualização de arte nunca chegaria
  a quem já instalou o jogo**. Agora `/assets/` é network-first com o cache
  como fallback offline.

## 5.2 Walk do herói via `generate_character_animations` (32 créditos)

Primeira geração pelo workflow de personagem de verdade (não mais o teste de
pose única). Mesmo `character_id` da base já aprovada (idle), para manter
identidade visual — é o próprio mecanismo do workflow: a animação usa a base
como referência.

- 8 frames, tira horizontal 8×1, **alpha binário nativo** (SpriteCook gera
  com transparência real — diferente da rota Grok, aqui não há passo de
  chroma-key).
- `registration: "shared"` — este é exatamente o caso para o qual o modo foi
  construído: ciclo de caminhada de verdade, frames na mesma tela, um único
  offset preserva o movimento relativo desenhado pelo artista.
- `resize: { height: 34, mode: "majority" }` — mesma receita do idle aprovado.

**Achado que exigiu mudança de código:** `player.ts` indexava o walk com
`% 4` fixo — hardcoded para o número de frames do procedural. Com 8 frames
gerados, os frames 4–7 seriam peso morto (nunca tocados). Corrigido para
`% s.walk.right.length`, com a cadência (`ticksPerFrame`) escalando para
manter a duração total do ciclo em ~28 ticks independente da contagem de
frames — 4 frames → 7 ticks/frame (idêntico ao original), 8 frames → 4
ticks/frame (mesma duração de ciclo, movimento mais suave). Mudança
cosmética, sem efeito em hitbox/timing de gameplay.

Verificado no jogo: 8 frames carregados, ticks capturados com espaçamento de
4 conforme calculado, zero erros em 300+ ticks de caminhada,
`__validateMap()` sem regressão (os 2 avisos pré-existentes não têm relação
com arte).

### Jump + attack (34 + 20 créditos, 2026-08-04)

Mesmo `character_id` (`2847b7ae-…`). Jump+attack no primeiro run (34 cr);
attack re-gerado sozinho (+20 cr) porque a 1ª geração cortava a ponta da
espada nas células 162×162 nos frames 4–6 do swing.

- **Jump:** 8 frames, tuck mid-air até 5px — `maxFeetDrift: 6`. `player.ts`
  anima o strip; **fall** reusa um frame mid-air do jump (índice ~60%)
  quando o jump é multi-frame, para não voltar ao procedural.
- **Attack:** 2ª geração (`hero-attack-regen2.png`) sem clip de borda.
  Progresso do `AttackInstance` mapeado sobre a contagem real de frames.
  Fallback: `tools/repair-attack-sword.mjs` reconstrói pontas cortadas
  (pad + extrapolação de lâmina) se uma geração futura clipar de novo.

Créditos restantes após jump+attack: ~2914 (adventurer).

### Set completo do herói (2026-08-04, restante do kit)

Presets de workflow + customs com prompt anti-crop:

| Key | Frames | Rota | Notas |
| --- | --- | --- | --- |
| `player.idle` | 8 | workflow (idle) | substituiu a pose única da Fase 1 |
| `player.walk` | 8 | workflow | |
| `player.jump` | 8 | workflow | fall reusa índice ~60% |
| `player.attack` | 8 | workflow (2ª gen) | |
| `player.attackUp` | 8 | custom | |
| `player.crouch` | 8 | custom | |
| `player.crouchAttack` | 8 | custom | |
| `player.backdash` | 8 | custom | |
| `player.hurt` | 8 | workflow | |
| `player.die` | 12 | workflow (death) | avança e segura o último frame |

Formas **bat** e **wolf** via generate + animate (8 frames cada) —
`player.bat` (wing flap) e `player.wolf` (run cycle). **Skeleton.walk** 8
frames (import da bible + animate walk).

Créditos restantes (aprox.): set humano ~2758; bat ~2680; wolf ~2648;
skeleton walk ~2628 (adventurer).

## 5.3 Rota alternativa: Grok Imagine (testada, não adotada)

Testada via automação de navegador (Claude in Chrome, sessão logada do
usuário) como alternativa de menor custo marginal ao SpriteCook. Achados
técnicos, preservados aqui porque o código de suporte (`tools/lib/chroma.mjs`,
`tools/remove-background.mjs`) continua no repositório caso a rota seja
retomada:

- O Grok não devolve alpha — pipeline próprio de chroma-key (flood-fill a
  partir da borda + erosão) foi construído e validado com teste sintético
  antes de gastar qualquer geração.
- **Falha real encontrada:** o Grok pintou vãos internos do esqueleto (caixa
  torácica, cintura) com uma cor próxima do fundo magenta escolhido — como
  esses vãos são regiões fechadas (inalcançáveis pela borda), o flood-fill
  corretamente não as apagou, mas o resultado vazava magenta por dentro do
  personagem. Corrigido trocando o fundo para ciano puro + proibição
  explícita da cor no prompt — funcionou.
- Descartado por decisão do usuário após ver o fluxo de trabalho na prática
  (não por limitação técnica insuperável). SpriteCook segue como rota única.

## 5. Inventário e rota por asset

Três tiers, escolhidos por custo × importância na tela.

### Tier A — workflow de personagem completo (`generate_character` + `generate_character_animations`)

Só para quem o jogador olha por horas:

| Asset | Caixa de frame | Animações | Créditos |
| --- | --- | --- | --- |
| Herói (player) | 40×36 | idle, walk, jump, attack, hurt, death + custom (crouch, backdash) | ~184 |
| Dracula | 32×40 | idle, attack, hurt, death | ~104 |
| Bone Colossus | 32×40 | walk, attack (windup), death | ~84 |

Perspective: `platformer`. As animações saem com 8–12 frames; o jogo usa
2–4 — o packer seleciona keyframes (índices fixos, documentados no manifest).

### Tier B — folha multi-pose via `generate_game_art` + fatiamento

Para os 10 minions. Uma imagem com 4 poses lado a lado, `pixel:true`,
`smart_crop:false`, style bible travada. ~2–8 créditos por tentativa.

| Asset | Caixa | Frames | Chave |
| --- | --- | --- | --- |
| Skeleton | 16×32 | 4 walk | `skeleton.walk` |
| Zombie | 16×32 | 4 walk | `zombie.walk` |
| Fishman | 16×32 | 4 walk + 2 attack | `fishman.walk` |
| Axe Knight | 16×32 | 4 walk + 2 throw | `axeKnight.walk` |
| Spear Guard | 16×32 | 4 walk + 2 thrust | `spearGuard.walk` |
| Clockwork Wraith | 24×40 | 4 float | `wraith.float` |
| Bat | 16×16 | 4 fly | `bat.fly` |
| Medusa Head | 16×16 | 2 fly | `medusaHead.fly` |
| Flea Man | 16×16 | 3 hop | `fleaMan.hop` |
| NPCs (ghost, demon, shopkeeper) | 16×32 | 2 idle | `*.idle` |

### Tier C — props, tiles e UI

| Grupo | Método | Observação |
| --- | --- | --- |
| Materiais de pedra (castle + tower) | `generate_game_art` `mode:"texture"`, 64×64 tileável | Fatiado à mão nos 14 `TileId`; **não** usar `generate_tileset` (autotile não mapeia) |
| Velas, pickups (heart, big heart, gold, potion), relic, warp, save | `generate_game_art`, 8×16 a 16×24, várias por imagem | Barato; uma folha só |
| Portraits de diálogo | `generate_game_art` 48×48 | Maior peso narrativo por crédito gasto |
| Parallax (castelo ao fundo, lua, nuvens) | `generate_game_art` 16:9, `pixel:true` | Substitui `parallax.ts`; alto impacto visual por crédito |

**Maior retorno por crédito:** parallax + materiais de pedra. Mudam a tela
inteira. Sprites de inimigo de 32px mudam pouco a percepção.

---

## 6. Fases de execução

### Fase 0 — Pipeline (0 créditos, só código) — **concluída**

1. ✅ Manifest v2 em `assets.ts` (retrocompatível) + `row/anchorX/anchorY`.
2. ✅ `resolveSprites.ts` cobrindo player, 12 inimigos, NPCs, props, pickups,
   projéteis, retratos; `resolveTileset` em `tiles.ts` ligado ao `Tilemap`.
3. ✅ `tools/process-sprites.mjs` + `tools/lib/{png,palette}.mjs` — codec PNG
   próprio sobre `node:zlib`, **zero dependências novas**.
4. ✅ `tools/validate-assets.mjs` — sai com código 1 em qualquer defeito.
5. ✅ `tools/make-test-asset.mjs` — gera arte autoral com os três defeitos
   típicos (fora de paleta, halo semi-transparente, canvas com sobra) para
   provar que o pipeline os corrige. `npm run assets:selftest`.
6. ✅ `npm run typecheck` limpo; override verificado no jogo rodando
   (esqueleto 16×32 vindo do PNG, pés na linha 31, 4 cores exatas de PAL,
   zero alpha parcial) e fallback procedural intacto ao remover a chave.

Comandos novos: `npm run assets:build`, `assets:validate`, `assets:selftest`.
O self-test escreve em `.assets-selftest/` (ignorado pelo git) para que o
fixture nunca vaze para o build.

### Fase 1 — Style bible + fatia vertical (~30–40 créditos, cabe no saldo)

7. Iterar a style bible na rota barata até aprovar.
8. Upload + `save_private_preset`.
9. Gerar **Skeleton** (Tier B) com a bible travada, processar, ligar no jogo.
10. Comparação lado a lado no preview: procedural × novo. Critério de
    aceite em §7. Se não passar, o problema é a bible, não o esqueleto —
    volta ao 7.

*Fim do que cabe nos 40 créditos.*

### Fase 2 — Ambiente (~150 créditos) — maior impacto visual

11. Parallax das 2 zonas.
12. Materiais de pedra castle + tower, fatiados nos 14 `TileId` × variantes.
13. Água, vitrais, portões, portas.

### Fase 3 — Bestiário (~200 créditos)

14. Os 9 minions restantes + 3 NPCs, todos Tier B, em lotes de 3.

### Fase 4 — Herói (~200 créditos)

15. Pack completo Tier A + formas bat/wolf. Feito por último de propósito:
    quando o resto já está no estilo final, o herói é gerado contra um
    contexto real, não contra uma intenção.

### Fase 5 — Bosses e polimento (~200 créditos)

16. Dracula, Bone Colossus, portraits, pickups, subweapons.
17. Passe final de coerência: revisar tudo junto, regerar os outliers.

---

## 7. Gates de QA (cada asset passa por todos)

Automático (`npm run assets:validate`, já implementado):

- [x] Toda cor opaca do PNG ∈ `PAL` ∪ `extraColors` declarado no config.
- [x] Alpha binário — nenhum pixel com `0 < a < 255`.
- [x] PNG grande o bastante para `frames × frameW` na `row` declarada.
- [x] Nenhum frame vazio.
- [x] A âncora declarada não corta conteúdo para fora da caixa.
- [x] Linha dos pés: algum frame tem de encostar na âncora, e a variação
      entre frames respeita `maxFeetDrift` (0 em registro `per-frame`, 4px em
      `shared` — onde mover o pé é a animação, não um defeito).

Manual, no preview do browser:

- [ ] Sem tremor: o corpo não escorrega de lado entre frames (o validador
      cobre a linha dos pés, mas não a leitura do movimento).
- [ ] Silhueta legível a 1× (480×270), não só com zoom.
- [ ] Contraste contra `stoneMid`/`stoneDark` — o inimigo não some na parede.
- [ ] `hurtFlash` continua legível (silhueta cheia, sem buracos internos).
- [ ] `npm run typecheck` limpo e `window.__errs` vazio após 60s de jogo.
- [ ] `window.__validateMap()` retorna `[]` se algum tile mudou.

Regra de ouro: **um asset que não passa volta a ser procedural** (basta
remover a chave do manifest). Nunca degradar o jogo por causa de arte nova.

---

## 8. Riscos

| Risco | Mitigação |
| --- | --- |
| Arte de IA em 32px não segura o padrão SotN | Fase 1 é exatamente o teste disso, por ~35 créditos. Se falhar, cancela-se o resto sem prejuízo. |
| Incoerência entre lotes gerados em dias diferentes | `style_asset_ids` + preset privado + `force_colors` em toda chamada. |
| Regressão de gameplay por hitbox × sprite | Hitboxes não mudam. Sprite só muda a caixa de desenho; o gate de foot-slide cobre o resto. |
| Créditos acabam no meio de uma fase | Fases são fechadas por tema — parar entre fases deixa o jogo coerente, não meio-a-meio. |
| `assets-src/` inchar o repositório | Raw em 1K, ~10 MB no total; aceitável. Se passar disso, Git LFS. |
