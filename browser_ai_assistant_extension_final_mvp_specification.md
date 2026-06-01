# Browser AI Assistant Extension - Final MVP Specification

## Visão Geral

Extensão para Chrome focada em interações contextuais com IA diretamente dentro da página.

O produto é inspirado em ferramentas como Monica e Sider, mas com foco em uma arquitetura local-first, suporte a APIs externas via API key e suporte a Ollama local.

A experiência principal acontece sobre o conteúdo da página:

```text
Selecionar texto
→ Floating Toolbar
→ Escolher ferramenta
→ Floating AI Panel
→ Follow-up contextual
```

O sidebar existe como apoio para histórico, configurações, sessões e prompts.

---

# Objetivos do MVP

## Objetivos principais

- Detectar texto selecionado em páginas web.
- Exibir uma toolbar flutuante compacta próxima à seleção.
- Permitir ações rápidas sobre o texto selecionado:
  - Conversar
  - Traduzir
  - Resumir
  - Explicar
  - Reescrever
- Abrir um painel flutuante na página com a resposta da IA.
- Permitir follow-up sobre o mesmo trecho.
- Suportar OpenAI via API key.
- Suportar Ollama local.
- Permitir seleção de modelo dentro do painel.
- Armazenar configurações localmente.
- Armazenar histórico e sessões localmente.
- Suportar temas via DaisyUI.
- Permitir que o usuário escolha o tema.
- Sincronizar tema entre sidebar, toolbar e painel flutuante.

---

# Princípios de Design

## A IA não deve interromper a leitura

A página deve continuar visível.

Evitar overlay escuro bloqueando o conteúdo.

O painel deve funcionar como uma janela flutuante, não como um modal bloqueante.

## A IA não deve esconder a fonte

O usuário deve conseguir comparar:

- texto original
- resposta da IA
- contexto da página

## Ações comuns devem exigir um clique

O usuário não deve precisar digitar "traduza isso" ou "resuma isso" repetidamente.

Ações rápidas existem para reduzir atrito.

## Toda ação vira uma conversa

Traduzir, resumir, explicar e reescrever são apenas prompts iniciais.

Depois da primeira resposta, o usuário pode continuar perguntando no campo de follow-up.

## O painel deve ser persistente

O painel flutuante pode ser:

- movido
- redimensionado
- minimizado
- fechado

Posição e tamanho devem ser preservados.

## A UI deve parecer ferramenta de produtividade

Referências visuais:

- Monica
- Linear
- Raycast
- Notion AI

Evitar aparência de dashboard corporativo pesado.

---

# UX Principal

## 1. Seleção de Texto

Quando o usuário selecionar texto:

- Capturar seleção.
- Calcular posição da seleção.
- Exibir floating toolbar próxima ao trecho.
- Não alterar o DOM original.
- Não injetar resposta junto ao texto.

## 2. Floating Toolbar

Toolbar compacta com ícones e tooltips.

Ações iniciais:

```text
[ Conversar ] [ Traduzir ] [ Resumir ] [ Explicar ] [ Reescrever ] [ Mais ]
```

Visual sugerido:

```text
[ 💬 ] [ 🌎 ] [ 📄 ] [ 💡 ] [ ✏️ ] [ ⋯ ]
```

Requisitos:

- Compacta.
- Baixo ruído visual.
- Posicionada perto da seleção.
- Não cobre o texto selecionado.
- Detecta colisão com viewport.
- Usa Shadow DOM.
- Usa o mesmo tema configurado pelo usuário.

## 3. Floating AI Panel

O painel substitui o conceito de modal tradicional.

Requisitos:

- Janela flutuante.
- Sem overlay escuro.
- Renderizado dentro da página.
- Movível.
- Redimensionável.
- Minimizado/fechado pelo usuário.
- Isolado via Shadow DOM.
- Usa o mesmo tema do sidebar.
- Suporta streaming de resposta.
- Mantém contexto da sessão.

## 4. Follow-Up

Após qualquer ação inicial, o painel exibe um campo:

```text
Ask follow-up...
```

O usuário pode continuar conversando sobre o texto selecionado.

Exemplos:

- Faça uma versão mais técnica.
- Traduza agora para espanhol.
- Explique em tópicos.
- Isso contradiz o texto anterior?
- Quais são os riscos?

---

# Ferramentas

Do ponto de vista do usuário, existem ferramentas separadas.

Do ponto de vista interno, todas usam a mesma engine.

A diferença está no prompt inicial.

## Ferramentas do MVP

### Conversar

Abre o painel com o texto selecionado como contexto e aguarda pergunta livre.

### Traduzir

Traduz o trecho selecionado para o idioma configurado ou escolhido no painel.

### Resumir

Resume o trecho selecionado.

### Explicar

Explica o trecho selecionado em linguagem clara.

### Reescrever

Reescreve o trecho selecionado mantendo o significado.

---

# Arquitetura de Ferramentas

```typescript
type tool_id =
    | 'chat'
    | 'translate'
    | 'summarize'
    | 'explain'
    | 'rewrite';

type tool_definition = {
    id: tool_id;
    name: string;
    icon: string;
    system_prompt: string;
    user_prompt_template: string;
};
```

Fluxo:

```text
tool_id
→ prompt
→ provider
→ resposta
→ contextual_session
```

---

# Floating AI Panel - Layout

## Header

Contém:

- Nome da ferramenta atual.
- Seletor de modelo.
- Botão de minimizar.
- Botão de fechar.
- Handle para arrastar.

Exemplo:

```text
Translate                         GPT-5 Mini ▼     _   x
```

## Body

Contém:

- Preview recolhível do texto selecionado.
- Resposta da IA.
- Estado de loading/streaming.
- Mensagens anteriores da sessão.

## Footer

Contém:

- Campo de follow-up.
- Botão enviar.
- Ações rápidas.
- Indicador de provider/modelo.

Exemplo:

```text
Ask follow-up...                         Copy   Actions ▼
OpenAI · GPT-5 Mini
```

---

# Ações de Resposta

Cada resposta deve oferecer ações rápidas.

## Copy

Copia apenas a resposta gerada.

## Actions Menu

Menu expansível com:

- Regenerate
- Save Session
- Open in Sidebar
- Export Markdown
- Copy Prompt

## Regenerate

Reexecuta a mesma ação usando:

- mesmo texto selecionado
- mesma ferramenta
- mesmo prompt
- modelo atual

Útil quando o usuário troca de modelo antes de regenerar.

## Save Session

Salva a sessão no histórico.

## Open in Sidebar

Abre a sessão atual no sidebar para conversa longa.

## Export Markdown

Exporta a sessão em Markdown.

## Copy Prompt

Copia o prompt final usado para gerar a resposta.

---

# Seletor de Modelo

O seletor de modelo deve ficar dentro do Floating AI Panel.

Não deve ficar apenas em configurações.

Motivo:

O modelo pode variar por tarefa.

Exemplos:

- Tradução simples: modelo barato/local.
- Análise técnica: modelo mais forte.
- Dados sensíveis: Ollama local.
- Resumo simples: modelo leve.

Estrutura:

```typescript
type provider = {
    id: string;
    name: string;
    models: model[];
};

type model = {
    id: string;
    name: string;
    provider_id: string;
    supports_streaming: boolean;
};
```

---

# Providers

## OpenAI

Configuração:

- API key local.
- Modelo padrão configurável.
- Modelo selecionável no painel.

## Ollama

Configuração:

```text
http://localhost:11434
```

## LM Studio

Configuração:

```text
http://localhost:1234/v1
```


A extensão deve permitir:

- testar conexão
- listar modelos disponíveis futuramente
- configurar modelo padrão
- selecionar modelo no painel

Toda comunicação com Ollama deve passar pelo background worker.

---

# Temas

## DaisyUI

Usar DaisyUI para acelerar consistência visual.

Temas iniciais:

- system
- light
- dark
- corporate
- dracula

## Requisitos

O usuário pode escolher o tema nas configurações.

O tema deve ser aplicado em:

- Sidebar
- Floating Toolbar
- Floating AI Panel

Mudanças de tema devem refletir em interfaces abertas.

Persistir tema em `chrome.storage.local`.

---

# Look and Feel

## Direção Visual

- Minimalista.
- Compacto.
- Moderno.
- Baixo ruído visual.
- Cantos arredondados.
- Sombras suaves.
- Interface densa, mas legível.
- Sem aparência de dashboard corporativo.

## Animações

Permitidas:

- fade in
- fade out
- scale 98% → 100%
- transições suaves em drag/resize

Evitar:

- bounce
- animações longas
- efeitos chamativos
- excesso de gradientes

---

# Sidebar

O sidebar é secundário.

Responsabilidades:

- Histórico.
- Configurações.
- Gerenciamento de prompts.
- Sessões salvas.
- Conversas longas.

O uso diário deve acontecer principalmente via:

```text
Selection Toolbar
→ Floating AI Panel
```

---

# Storage

## chrome.storage.local

Usar para dados leves e globais:

- API keys.
- Tema.
- Provider padrão.
- Modelo padrão.
- URL do Ollama.
- Preferência de salvar histórico.
- Posição do painel.
- Tamanho do painel.

Exemplo:

```typescript
type app_settings = {
    theme: string;
    default_provider: 'openai' | 'ollama';
    default_model: string;
    ollama_base_url: string;
    save_history: boolean;
    panel_position_x: number;
    panel_position_y: number;
    panel_width: number;
    panel_height: number;
};
```

## IndexedDB

Usar para dados maiores:

- Sessões.
- Mensagens.
- Histórico.
- Prompts customizados.
- Snapshots opcionais de contexto.

Exemplo:

```typescript
type contextual_session = {
    id: string;
    tool_id: tool_id;
    source_url: string;
    page_title: string;
    selected_text: string;
    page_context?: string;
    provider_id: string;
    model_id: string;
    created_at: string;
    updated_at: string;
};
```

```typescript
type contextual_message = {
    id: string;
    session_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    created_at: string;
};
```

---

# Stack Técnico

## Core

- TypeScript
- Svelte
- Vite (via NVM)
- Tailwind CSS
- DaisyUI
- Zod

## Chrome Extension

- Manifest V3
- Content scripts
- Background service worker
- Side Panel API
- `chrome.storage.local`
- IndexedDB

## IA

- OpenAI API
- Ollama local

---

# Estrutura de Diretórios

```text
src/

├─ background/
│  ├─ service_worker.ts
│  ├─ message_router.ts
│  ├─ provider_gateway.ts
│  ├─ openai_provider.ts
│  └─ ollama_provider.ts
│
├─ content/
│  ├─ selection_detector.ts
│  ├─ floating_toolbar.ts
│  ├─ floating_ai_panel.ts
│  ├─ panel_drag.ts
│  ├─ panel_resize.ts
│  ├─ page_context.ts
│  └─ shadow_root.ts
│
├─ side_panel/
│  ├─ app.svelte
│  ├─ history.svelte
│  ├─ settings.svelte
│  ├─ prompts.svelte
│  └─ chat.svelte
│
├─ components/
│  ├─ model_selector.svelte
│  ├─ response_actions.svelte
│  ├─ follow_up_input.svelte
│  └─ theme_selector.svelte
│
├─ prompts/
│  ├─ translate_prompt.ts
│  ├─ summarize_prompt.ts
│  ├─ explain_prompt.ts
│  ├─ rewrite_prompt.ts
│  └─ chat_prompt.ts
│
├─ storage/
│  ├─ settings_storage.ts
│  ├─ session_storage.ts
│  └─ prompt_storage.ts
│
├─ types/
├─ validators/
└─ utils/
```

---

# Segurança

## Regra Principal

Content scripts nunca chamam providers diretamente.

Fluxo obrigatório:

```text
content_script
→ background
→ provider
→ background
→ content_script
```

## API Keys

- Armazenar localmente.
- Não enviar para backend próprio.
- Não sincronizar automaticamente.
- Não expor em logs.

## Ollama

- URL configurável.
- Default: `http://localhost:11434`.
- Requisições feitas pelo background worker.

---

# Fases de Implementação

## Fase 1 - Setup Base

Objetivo: criar a base técnica da extensão.

Entregas:

- Projeto com Vite + Svelte + TypeScript.
- Tailwind CSS.
- DaisyUI.
- Manifest V3.
- Estrutura inicial de diretórios.
- Build funcional.
- Extensão carregável no Chrome em modo developer.

Critério de aceite:

- Extensão instala localmente.
- Side panel básico abre.
- Content script carrega em páginas comuns.

---

## Fase 2 - Tema e Configurações

Objetivo: implementar configurações globais.

Entregas:

- `settings_storage`.
- Tela de configurações no sidebar.
- Seletor de tema.
- Provider padrão.
- Modelo padrão.
- URL do Ollama.
- Preferência de salvar histórico.

Critério de aceite:

- Tema escolhido persiste.
- Sidebar reflete tema.
- Configurações sobrevivem ao reload.

---

## Fase 3 - Providers

Objetivo: implementar camada de IA desacoplada.

Entregas:

- Interface comum de provider.
- OpenAI provider.
- Ollama provider.
- Provider gateway.
- Teste de conexão com Ollama.
- Validação com Zod.

Critério de aceite:

- Usuário consegue enviar prompt manual.
- OpenAI responde.
- Ollama responde quando disponível.
- Erros aparecem de forma clara.

---

## Fase 4 - Selection Engine

Objetivo: capturar seleção de texto na página.

Entregas:

- `selection_detector`.
- Captura de texto selecionado.
- Captura de bounding rect.
- Tratamento de seleção vazia.
- Tratamento de scroll.
- Debounce básico.

Critério de aceite:

- Selecionar texto em página comum captura texto corretamente.
- Limpar seleção remove estado.
- Não interfere no comportamento nativo do browser.

---

## Fase 5 - Floating Toolbar

Objetivo: exibir toolbar compacta após seleção.

Entregas:

- Shadow DOM.
- Floating toolbar.
- Ícones das ferramentas.
- Tooltips.
- Posicionamento inteligente.
- Collision detection com viewport.
- Tema sincronizado.

Critério de aceite:

- Toolbar aparece ao selecionar texto.
- Toolbar não cobre a seleção.
- Toolbar usa o tema configurado.
- Clique em ferramenta dispara evento correto.

---

## Fase 6 - Floating AI Panel

Objetivo: implementar painel flutuante principal.

Entregas:

- Shadow DOM.
- Painel sem overlay.
- Header.
- Body.
- Footer.
- Preview do texto selecionado.
- Campo follow-up.
- Seletor de modelo.
- Indicador de provider.
- Estado de loading.
- Streaming de resposta.

Critério de aceite:

- Painel abre ao clicar em ferramenta.
- Página continua utilizável.
- Resposta aparece no painel.
- Follow-up envia nova mensagem.
- Modelo pode ser trocado no painel.

---

## Fase 7 - Drag, Resize e Persistência do Painel

Objetivo: tornar o painel utilizável como janela flutuante.

Entregas:

- Drag pelo header.
- Resize pelo canto inferior direito.
- Limites de viewport.
- Persistência de posição.
- Persistência de tamanho.
- Minimize.
- Close.

Critério de aceite:

- Usuário move o painel.
- Usuário redimensiona o painel.
- Posição e tamanho são lembrados.
- Painel não fica perdido fora da tela.

---

## Fase 8 - Tools e Prompts

Objetivo: implementar ações rápidas.

Entregas:

- Chat.
- Translate.
- Summarize.
- Explain.
- Rewrite.
- Prompts iniciais.
- Arquitetura de `tool_definition`.
- Primeira mensagem automática conforme ferramenta.

Critério de aceite:

- Cada ferramenta gera resposta adequada.
- Todas permitem follow-up.
- A sessão mantém contexto da seleção.

---

## Fase 9 - Response Actions

Objetivo: implementar ações sobre respostas.

Entregas:

- Copy.
- Actions menu.
- Regenerate.
- Save Session.
- Open in Sidebar.
- Export Markdown.
- Copy Prompt.

Critério de aceite:

- Copy copia a resposta.
- Regenerate reexecuta a mesma solicitação.
- Save Session persiste no histórico.
- Export Markdown gera conteúdo válido.

---

## Fase 10 - Histórico e Sessões

Objetivo: persistir sessões no IndexedDB.

Entregas:

- `session_storage`.
- `contextual_session`.
- `contextual_message`.
- Listagem no sidebar.
- Abertura de sessão salva.
- Exclusão de sessão.

Critério de aceite:

- Sessões salvas aparecem no sidebar.
- Mensagens são restauradas.
- Sessões podem ser apagadas.

---

## Fase 11 - Prompt Manager

Objetivo: permitir customização de prompts.

Entregas:

- Prompts built-in.
- Prompts customizados.
- CRUD básico de prompts.
- Associação de prompt a ferramenta.

Critério de aceite:

- Usuário visualiza prompts.
- Usuário cria prompt.
- Usuário edita prompt.
- Prompt customizado pode ser usado.

---

## Fase 12 - Polimento UX

Objetivo: melhorar sensação de produto.

Entregas:

- Loading states.
- Empty states.
- Error states.
- Animações leves.
- Atalhos de teclado básicos.
- Ajustes responsivos.
- Melhorias de acessibilidade.

Critério de aceite:

- Fluxo principal parece fluido.
- Erros são compreensíveis.
- UI não conflita com páginas comuns.

---

# Funcionalidades Futuras

## V2 - Pinned Context

Permitir fixar múltiplos trechos como contexto.

Fluxo:

```text
Selecionar trecho A
→ Pin

Selecionar trecho B
→ Pin

Perguntar:
"Esses dois trechos se contradizem?"
```

Útil para:

- contratos
- especificações
- documentação técnica
- análise de requisitos
- code review

## V2 - Ferramentas Customizadas na Toolbar

Permitir que o usuário crie ferramentas próprias.

Exemplos:

- Revisar contrato.
- Analisar código Python.
- Extrair requisitos.
- Melhorar e-mail.
- Gerar resumo executivo.

## V3 - Providers Extras

- Anthropic.
- Gemini.
- OpenRouter.
- DeepSeek.

## V4 - PDF e OCR

- Leitura de PDF.
- Seleção em PDF.
- OCR de imagens.
- Resumo de documentos.

## V5 - Sync Opcional

- Conta do usuário.
- Backup.
- Sincronização de prompts.
- Sincronização de histórico.

## V6 - Agentes e Workflows

- Workflows encadeados.
- Automação de páginas.
- RAG local.
- Agentes especializados.
