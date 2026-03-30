# 🗂️ Mídias — Firebase Storage

## Visão Geral
Mídias são armazenadas no Firebase Storage e referenciadas no Firestore (`midias`).
Upload feito diretamente do frontend sem passar pelo backend.

## Tipos Suportados
| Tipo      | Extensões              | Limite |
|-----------|------------------------|--------|
| Imagem    | JPG, PNG, GIF, WEBP    | 50MB   |
| Áudio     | OGG, OPUS, MP3, WAV    | 50MB   |
| Vídeo     | MP4, MOV, WEBM         | 50MB   |
| Documento | PDF, etc.              | 50MB   |

## Estrutura Firestore (`midias`)
```
{
  nome:        string,   // nome original do arquivo
  url:         string,   // URL pública do Firebase Storage
  tipo:        string,   // imagem | audio | video | documento
  tamanho:     number,   // bytes
  storagePath: string,   // caminho no Storage (para exclusão)
  criadoEm:   Timestamp
}
```

## Firebase Storage Rules
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Aba Mídias (WhatsApp → Mídias)
- Upload via clique ou drag & drop
- Barra de progresso em tempo real
- Grid com preview (thumbnail imagem, player áudio, preview vídeo hover)
- Exclusão com verificação se mídia está em uso em alguma regra

## Uso das Mídias
As mídias podem ser vinculadas a:
1. **Envio Manual** — seleção por biblioteca ou upload na hora, modo junto/separado
2. **Envio Automático** — cada regra tem sua própria mídia opcional
3. **Template de Renovação** — mídia enviada junto com confirmação de renovação

## Exclusão
Ao excluir uma mídia:
1. Verifica se está em uso em alguma regra (`configwhatsapp/principal`)
2. Se em uso, exibe aviso e pede confirmação
3. Remove do Firebase Storage (`deleteObject`)
4. Remove do Firestore (`midias`)
