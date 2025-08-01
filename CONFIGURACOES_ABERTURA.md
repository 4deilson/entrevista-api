# Configurações de Abertura - Troubleshooting

## Problemas Identificados com FFmpeg

### 1. Filtro `select=eq(n,0)` truncado
- **Erro**: `Missing ')' or too many args in 'eq(n'`
- **Causa**: Shell truncando expressões com parênteses
- **Status**: ❌ Removido temporariamente

### 2. Filtro `geq` com máscara circular truncado  
- **Erro**: `Missing ')' or too many args in 'r(X'`
- **Causa**: Shell truncando `r=r(X,Y)` para `r=r(X`
- **Status**: ❌ Removido temporariamente

### 3. Filtro vazio/mal formado
- **Erro**: `No such filter: ''`
- **Causa**: String de filtro mal construída com espaços vazios
- **Status**: ❌ Problema atual - string sendo truncada

### 4. Soluções Tentadas
- ✅ Escape com aspas simples
- ✅ Escape com aspas duplas  
- ✅ Escape com backslash
- ❌ Todas falharam devido ao shell

## Solução Final: Versão Ultra-Simplificada

### ✅ IMPLEMENTADA - API FUNCIONANDO

**Nova Estratégia:**
1. ✅ Removida máscara circular complexa
2. ✅ Overlay simples direto do vídeo
3. ✅ Sem filtros problemáticos

### Funcionalidades Atuais
- ✅ API rodando na porta 3000
- ✅ Geração de vídeo funcionando
- ✅ Template da Vincci carregado
- ✅ Nome do candidato renderizado
- ⚠️  Vídeo do candidato em formato quadrado (sem máscara circular)

### Próximos Passos (Para Implementar Depois)
1. Implementar máscara circular via arquivo de máscara PNG
2. Usar filtro `mask` em vez de `geq`
3. Testar comando FFmpeg fora do container primeiro

## Status: ✅ FUNCIONANDO - VERSÃO BÁSICA
