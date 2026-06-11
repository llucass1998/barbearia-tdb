# TDB Barbearia

Sistema web para barbearia com atendimento por ordem de chegada, painel administrativo e controle financeiro simples.

O projeto foi criado para a Barbearia Turma do Bairro, com foco em uso real no balcao: o cliente entra na fila pelo celular, o administrador controla o atendimento e o sistema calcula o faturamento de cortes finalizados.

## Tecnologias

- React
- Vite
- Node.js
- Express
- SQLite nativo do Node
- Lucide React
- CSS responsivo

## Funcionalidades

- Entrada de clientes na fila por ordem de chegada
- Controle de status: aguardando, chamando, em atendimento, finalizado e saiu
- Alerta para o cliente quando chegar a vez dele
- Vibracao e aviso visual no celular quando o admin chama o cliente
- Cadastro de pedidos para datas especiais, como Natal e Ano Novo
- Lista de servicos com preco
- Botao de WhatsApp com mensagem pronta
- Link para Instagram da barbearia
- Painel admin para controlar fila e atendimentos
- Dashboard financeiro com faturamento do dia, semana e mes
- Banco local SQLite para manter dados entre reinicios

## Como Rodar

Instale as dependencias:

```bash
npm install
```

Suba a API:

```bash
npm run api
```

Em outro terminal, suba o site:

```bash
npm run dev
```

URLs locais:

- Site: `http://localhost:5174`
- API: `http://localhost:3334/api/status`

## Estrutura

```text
server/
  index.js        API Express e banco SQLite

src/
  App.jsx         Interface principal
  global.css      Estilos do sistema
  assets/         Logo e arquivos visuais
```

## Observacoes

O banco local fica em `server/data/barbearia.db` e esta ignorado no Git para evitar subir dados de clientes.

Este projeto mostra habilidades praticas em front-end, back-end, integracao com API, persistencia local, responsividade e criacao de painel administrativo.
