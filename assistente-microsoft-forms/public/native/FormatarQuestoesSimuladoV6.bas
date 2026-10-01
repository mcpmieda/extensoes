Attribute VB_Name = "FormatarQuestoesSimuladoV5"
Option Explicit

' FORMATAR QUESTOES - V6.3 DINAMICA
' Mesmo ponto de entrada; uma ou mais questoes, modelos e arquivos avulsos.
' Areas: configuracao do documento, cabecalhos existentes, capa, ou area unica.
' Preserva a ordem e a ancoragem do conteudo e as equacoes editaveis.
' Usa KeepWithNext/KeepTogether do Word, sem preencher colunas com Enters.
' Questao maior que a coluna: fluxo natural com titulo ligado ao primeiro conteudo.
' Audita fragmentacao, texto, contagens de imagens/formulas, secoes e graficos do modelo.
' Um registro Undo por execucao. Fontes externas sao abertas com macros desabilitadas.
Private Const NOME_REGISTRO_UNDO As String = "FORMATAR QUESTOES V6.3"
Private Const MINIMO_QUESTOES_VALIDAS As Long = 1
Private Const MAXIMO_QUESTOES_VALIDAS As Long = 9999

Private mResultadoTeste As String
Private mDetalheAuditoria As String
Private mTitulos As Collection
Private mDocAnalise As Document
Private mAreas As Collection
Private mExcecoes As Collection
Private mRepaginacoes As Long
Private mInicioExecucao As Single
Private mUltimoRelatorio As String
Private mNomesAreasAnteriores As Collection

Private Type TAnaliseQuestoes
    Valida As Boolean
    Ambigua As Boolean
    ViuMarcador As Boolean
    IndiceInicio As Long
    IndiceUltimo As Long
    quantidade As Long
    QuantidadeFormatada As Long
    PrimeiroNumero As Long
    ultimoNumero As Long
End Type

' =====================================================
' ENTRADA NORMAL - aparece na lista de macros
' =====================================================
Public Sub FORMATAR_QUESTOES_INTELIGENTE()
    ExecutarFormatacaoQuestoes vbNullString, False
End Sub

' =====================================================
' ENTRADA PARA TESTES AUTOMATIZADOS
' Nao aparece como macro comum porque recebe argumento.
' =====================================================
Public Function FORMATAR_QUESTOES_TESTE(ByVal caminhoArquivoQuestoes As String) As String
    mResultadoTeste = vbNullString
    ExecutarFormatacaoQuestoes caminhoArquivoQuestoes, True
    FORMATAR_QUESTOES_TESTE = mResultadoTeste
End Function

' =====================================================
' FLUXO PRINCIPAL
' =====================================================
Private Sub ExecutarFormatacaoQuestoes(ByVal caminhoForcado As String, ByVal modoSilencioso As Boolean)

    On Error GoTo TratarErro

    Dim doc As Document
    Dim analise As TAnaliseQuestoes
    Dim rngPagina2 As Range
    Dim rngInicioArea As Range
    Dim rngFimArea As Range
    Dim caminhoFonte As String
    Dim importouArquivo As Boolean
    Dim jaEstavaFormatado As Boolean
    Dim registroUndoAtivo As Boolean

    Dim formulasAntes As Long, formulasFonte As Long
    Dim estruturaAntes As String
    Dim telaAnterior As Boolean
    telaAnterior = Application.ScreenUpdating
    Dim assinaturaAntes As String
    Dim assinaturaDepois As String
    Dim assinaturaFonte As String
    Dim imagensAntes As Long
    Dim imagensDepois As Long
    Dim imagensFonte As Long
    Dim separadoresAntes As Long
    Dim separadoresDepois As Long
    Dim secoesAntes As Long
    Dim secoesDepois As Long
    Dim quantidadeFonte As Long
    Dim quantidadeAntes As Long
    Dim quantidadeFinal As Long

    mRepaginacoes = 0
    mInicioExecucao = Timer
    mUltimoRelatorio = vbNullString
    Set mAreas = New Collection
    Set mExcecoes = New Collection
    Set doc = ActiveDocument
    CarregarNomesAreasAnteriores doc

    If doc Is Nothing Then
        Err.Raise vbObjectError + 2000, , "Nenhum documento ativo foi encontrado."
    End If

    estruturaAntes = AssinaturaEstruturaModelo(doc)
    If doc.ReadOnly Or doc.ProtectionType <> wdNoProtection Then
        Err.Raise vbObjectError + 2223, , "O documento esta protegido ou aberto somente para leitura."
    End If
    If doc.TrackRevisions Then
        Err.Raise vbObjectError + 2224, , "Desative o controle de alteracoes antes de formatar as questoes."
    End If
    Application.ScreenUpdating = False
    Repaginar doc

    AnalisarSequenciaQuestoes doc, 0, analise
    If Not analise.Valida Then
        If Not ObterEspacoImportacao(doc, rngPagina2) Then
            Err.Raise vbObjectError + 2001, , _
                "Nao foi encontrada uma sequencia de questoes nem uma area vazia para importar."
        End If
    End If

    If analise.Valida Then

        jaEstavaFormatado = (analise.QuantidadeFormatada = analise.quantidade)


    Else

        If analise.ViuMarcador Or analise.Ambigua Then
            Err.Raise vbObjectError + 2003, , _
                "Foram encontrados marcadores de questao, mas a sequencia nao e confiavel. " & _
                "Corrija a numeracao antes de executar a macro."
        End If

        If Not DocumentoElegivelParaImportacao(doc, rngPagina2) Then
            Err.Raise vbObjectError + 2004, , _
                "Nao ha uma sequencia valida de questoes e a segunda pagina nao esta vazia " & _
                "ou nao pertence a uma area vazia de questoes. Nenhum arquivo foi importado."
        End If

        If caminhoForcado <> vbNullString Then
            caminhoFonte = caminhoForcado
        Else
            caminhoFonte = SolicitarArquivoDeQuestoes()
        End If

        If caminhoFonte = vbNullString Then GoTo SaidaSemAlteracao

        If StrComp(NormalizarCaminho(caminhoFonte), NormalizarCaminho(doc.FullName), vbTextCompare) = 0 Then
            Err.Raise vbObjectError + 2005, , _
                "O arquivo de origem nao pode ser o mesmo documento que esta sendo formatado."
        End If

        ' A origem e aberta e validada antes do registro de Undo. Abrir outro
        ' documento durante um registro personalizado pode quebrar o agrupamento
        ' do Undo em algumas versoes do Word.
        ValidarArquivoDeQuestoes caminhoFonte, quantidadeFonte, imagensFonte, assinaturaFonte, formulasFonte

        Application.UndoRecord.StartCustomRecord NOME_REGISTRO_UNDO
        registroUndoAtivo = True

        InserirArquivoDeQuestoes doc, rngPagina2.Start, caminhoFonte

        importouArquivo = True
        Repaginar doc

        If Not LocalizarAreaProva(doc, rngInicioArea, rngFimArea, analise) Then
            Err.Raise vbObjectError + 2006, , _
                "O arquivo foi inserido, mas nao formou uma sequencia valida de questoes."
        End If

        If analise.quantidade <> quantidadeFonte Then
            Err.Raise vbObjectError + 2007, , _
                "A quantidade de questoes mudou durante a importacao."
        End If

        If AssinaturaConteudoQuestoes(doc, rngInicioArea, rngFimArea) <> assinaturaFonte Then
            Err.Raise vbObjectError + 2008, , _
                "A verificacao de texto falhou logo apos a importacao."
        End If

        If ContarImagensDeConteudo(doc, rngInicioArea, rngFimArea) <> imagensFonte Then
            Err.Raise vbObjectError + 2009, , _
                "A verificacao de imagens falhou logo apos a importacao."
        End If

        If doc.Range(rngInicioArea.Start, rngFimArea.End).OMaths.Count <> formulasFonte Then
            Err.Raise vbObjectError + 2220, , "Equacoes alteradas durante a importacao."
        End If
        jaEstavaFormatado = False

    End If

    If Not registroUndoAtivo Then
        Application.UndoRecord.StartCustomRecord NOME_REGISTRO_UNDO
        registroUndoAtivo = True
    End If

    If Not LocalizarAreaProva(doc, rngInicioArea, rngFimArea, analise) Then
        Err.Raise vbObjectError + 2010, , _
            "Nao foi possivel delimitar a area das questoes com seguranca."
    End If

    DefinirAreas doc, analise.quantidade

    assinaturaAntes = AssinaturaConteudoQuestoes(doc, rngInicioArea, rngFimArea)
    quantidadeAntes = analise.quantidade
    formulasAntes = doc.Range(rngInicioArea.Start, rngFimArea.End).OMaths.Count
    imagensAntes = ContarImagensDeConteudo(doc, rngInicioArea, rngFimArea)
    separadoresAntes = ContarSeparadoresProtegidos(doc)
    secoesAntes = doc.Sections.Count

    FormatarQuestoesBrutas doc, rngInicioArea, rngFimArea

    ' Recalcula os limites depois das alteracoes de texto e imagem.
    If Not LocalizarAreaProva(doc, rngInicioArea, rngFimArea, analise) Then
        Err.Raise vbObjectError + 2011, , _
            "A area das questoes deixou de ser reconhecida durante a formatacao."
    End If

    InserirCabecalhosDasAreas doc

    If Not LocalizarAreaProva(doc, rngInicioArea, rngFimArea, analise) Then
        Err.Raise vbObjectError + 2012, , _
            "A area das questoes deixou de ser reconhecida apos os cabecalhos."
    End If

    ' Tambem em documentos ja formatados, elimina espacamentos herdados e
    ' reduz os vazios estruturais ao minimo antes de recalcular o layout.
    NormalizarEspacosEstruturais doc, rngInicioArea, rngFimArea

    AplicarLinhasEmBranco doc
    If Not LocalizarAreaProva(doc, rngInicioArea, rngFimArea, analise) Then
        Err.Raise vbObjectError + 2230, , "A sequencia mudou ao separar os blocos visuais."
    End If
    RemoverVaziosDepoisDasQuestoes doc, rngFimArea
    AtualizarContagemDaCapa doc, analise.quantidade
    AplicarLayoutInteligenteQuestoes doc, rngInicioArea, rngFimArea, Not jaEstavaFormatado

    mDetalheAuditoria = vbNullString
    If Not ValidarLayoutFinal(doc, rngInicioArea, rngFimArea) Then
        Err.Raise vbObjectError + 2019, , _
            "A auditoria final encontrou um problema de conteudo ou paginacao." & _
            IIf(mDetalheAuditoria <> vbNullString, vbCrLf & mDetalheAuditoria, vbNullString)
    End If

    If Not LocalizarAreaProva(doc, rngInicioArea, rngFimArea, analise) Then
        Err.Raise vbObjectError + 2013, , _
            "A validacao final nao encontrou a sequencia de questoes."
    End If

    assinaturaDepois = AssinaturaConteudoQuestoes(doc, rngInicioArea, rngFimArea)
    imagensDepois = ContarImagensDeConteudo(doc, rngInicioArea, rngFimArea)
    separadoresDepois = ContarSeparadoresProtegidos(doc)
    secoesDepois = doc.Sections.Count
    quantidadeFinal = analise.quantidade

    If assinaturaAntes <> assinaturaDepois Then
        Err.Raise vbObjectError + 2014, , _
            "A verificacao final detectou alteracao ou perda de texto."
    End If

    If imagensAntes <> imagensDepois Then
        Err.Raise vbObjectError + 2015, , _
            "A verificacao final detectou alteracao na quantidade de imagens das questoes."
    End If

    If separadoresAntes <> separadoresDepois Then
        Err.Raise vbObjectError + 2016, , _
            "A verificacao final detectou alteracao nos separadores protegidos do modelo."
    End If

    If secoesAntes <> secoesDepois Then
        Err.Raise vbObjectError + 2017, , _
            "A verificacao final detectou uma quebra de secao nova ou removida."
    End If

    If quantidadeFinal <> quantidadeAntes Or quantidadeFinal < MINIMO_QUESTOES_VALIDAS Then
        Err.Raise vbObjectError + 2018, , _
            "A verificacao final da quantidade de questoes falhou."
    End If

    If doc.Range(rngInicioArea.Start, rngFimArea.End).OMaths.Count <> formulasAntes Then
        Err.Raise vbObjectError + 2221, , "Equacoes alteradas durante a formatacao."
    End If
    If AssinaturaEstruturaModelo(doc) <> estruturaAntes Then
        Err.Raise vbObjectError + 2222, , "A estrutura de secoes ou os graficos protegidos do modelo foram alterados."
    End If
    SalvarConfiguracaoDetectada doc
    mUltimoRelatorio = quantidadeFinal & " questoes; " & imagensDepois & _
        " imagens; " & mAreas.Count & " areas; " & mRepaginacoes & " repaginacoes; " & _
        Format$(SegundosDecorridos(), "0.00") & " s; " & mExcecoes.Count & " blocos maiores que uma coluna."
    GravarVariavel doc, "GSS_ULTIMA_AUDITORIA", mUltimoRelatorio
    Application.UndoRecord.EndCustomRecord
    registroUndoAtivo = False
    Application.ScreenUpdating = telaAnterior

    If Not modoSilencioso Then
        Dim mensagemFinal As String
        mensagemFinal = quantidadeFinal & " QUESTOES FORMATADAS."
        If importouArquivo Then mensagemFinal = mensagemFinal & vbCrLf & "Arquivo bruto importado com seguranca."
        mensagemFinal = mensagemFinal & vbCrLf & _
            "Texto, imagens, secoes e paginacao foram validados." & vbCrLf & mUltimoRelatorio
        MsgBox mensagemFinal, vbInformation
    Else
        mResultadoTeste = "OK|" & quantidadeFinal & "|" & _
            CStr(imagensDepois) & "|" & CStr(separadoresDepois) & "|" & CStr(secoesDepois)
    End If

    Exit Sub

SaidaSemAlteracao:
    Application.ScreenUpdating = telaAnterior
    If modoSilencioso Then mResultadoTeste = "CANCELADO"
    Exit Sub

TratarErro:

    Dim numeroErro As Long
    Dim descricaoErro As String
    Dim undoConfirmado As Boolean

    numeroErro = Err.Number
    descricaoErro = Err.Description

    On Error Resume Next
    If registroUndoAtivo Then
        Application.UndoRecord.EndCustomRecord
        registroUndoAtivo = False
        undoConfirmado = doc.Undo(1)
        If Not undoConfirmado Then descricaoErro = descricaoErro & vbCrLf & _
            "O Word nao confirmou o desfazer. Verifique o documento antes de salvar."

    End If
    Application.ScreenUpdating = telaAnterior
    On Error GoTo 0

    If modoSilencioso Then
        mResultadoTeste = "ERRO|" & CStr(numeroErro) & "|" & descricaoErro
    Else
        MsgBox "A macro foi cancelada." & _
            vbCrLf & vbCrLf & descricaoErro, vbCritical
    End If

End Sub

' =====================================================
' ANALISE DA SEQUENCIA
' =====================================================
Private Sub AnalisarSequenciaQuestoes(ByVal doc As Document, ByVal posicaoMinima As Long, _
    ByRef resultado As TAnaliseQuestoes)
    Dim p As Paragraph, n As Long, esperado As Long, i As Long
    Dim texto As String, formatado As Boolean
    ZerarAnalise resultado
    Set mTitulos = New Collection
    Set mDocAnalise = doc
    esperado = 1
    For Each p In doc.Paragraphs
        i = i + 1
        If p.Range.Start >= posicaoMinima Then
            texto = LimparTexto(p.Range.Text)
            If resultado.quantidade > 0 And EhMarcadorDepoisDaProva(texto) Then Exit For
            n = ExtrairNumeroQuestao(texto, formatado)
            If n > 0 And Not formatado Then
                If p.Range.Tables.Count > 0 Then n = 0
            End If
            If n > 0 Then
                resultado.ViuMarcador = True
                If n = esperado Then
                    If resultado.quantidade = 0 Then
                        resultado.IndiceInicio = i
                        resultado.PrimeiroNumero = n
                    End If
                    resultado.IndiceUltimo = i
                    resultado.ultimoNumero = n
                    resultado.quantidade = resultado.quantidade + 1
                    If formatado Then resultado.QuantidadeFormatada = resultado.QuantidadeFormatada + 1
                    mTitulos.Add p.Range.Duplicate
                    esperado = esperado + 1
                ElseIf n > esperado Or formatado Or texto = CStr(n) Or texto = CStr(n) & "." Or texto = CStr(n) & ")" Then
                    resultado.Ambigua = True
                    Exit For
                End If
            End If
        End If
    Next p
    resultado.Valida = resultado.quantidade >= MINIMO_QUESTOES_VALIDAS And Not resultado.Ambigua
End Sub

Private Sub ZerarAnalise(ByRef resultado As TAnaliseQuestoes)
    resultado.Valida = False
    resultado.Ambigua = False
    resultado.ViuMarcador = False
    resultado.IndiceInicio = 0
    resultado.IndiceUltimo = 0
    resultado.quantidade = 0
    resultado.QuantidadeFormatada = 0
    resultado.PrimeiroNumero = 0
    resultado.ultimoNumero = 0
End Sub

Private Function ExtrairNumeroQuestao(ByVal texto As String, ByRef ehFormatado As Boolean) As Long
    Dim prefixo As Long, restante As String
    ExtrairNumeroQuestao = LerMarcador(texto, ehFormatado, prefixo, restante)
End Function

Private Function TentarExtrairNumeroMarcador(ByVal texto As String, _
    ByRef numero As Long) As Boolean

    Dim i As Long
    Dim digitos As String
    Dim restante As String
    Dim c As String

    texto = Trim$(texto)
    If texto = vbNullString Then Exit Function

    For i = 1 To Len(texto)
        c = Mid$(texto, i, 1)
        If c < "0" Or c > "9" Then Exit For
        digitos = digitos & c
    Next i

    If digitos = vbNullString Then Exit Function

    restante = Trim$(Mid$(texto, Len(digitos) + 1))
    For i = 1 To Len(restante)
        c = Mid$(restante, i, 1)
        If InStr(1, ".)-:" & ChrW$(&HBA) & ChrW$(&HB0), c, vbBinaryCompare) = 0 Then Exit Function
    Next i

    If Len(digitos) > 4 Then Exit Function
    numero = CLng(digitos)
    If numero < 1 Or numero > MAXIMO_QUESTOES_VALIDAS Then Exit Function

    TentarExtrairNumeroMarcador = True

End Function

Private Function PosicaoPrimeiroDigito(ByVal texto As String) As Long

    Dim i As Long
    Dim c As String

    For i = 1 To Len(texto)
        c = Mid$(texto, i, 1)
        If c >= "0" And c <= "9" Then
            PosicaoPrimeiroDigito = i
            Exit Function
        End If
    Next i

End Function

Private Function PrefixoDeNumeroValido(ByVal prefixo As String) As Boolean

    Dim i As Long
    Dim c As String
    Dim permitidos As String

    permitidos = " N.O#.-:" & ChrW$(&HBA) & ChrW$(&HB0)

    For i = 1 To Len(prefixo)
        c = Mid$(prefixo, i, 1)
        If InStr(1, permitidos, c, vbBinaryCompare) = 0 Then Exit Function
    Next i

    PrefixoDeNumeroValido = True

End Function

Private Function EhNumeroInteiroPositivo(ByVal texto As String) As Boolean

    Dim i As Long
    Dim c As String

    texto = Trim$(texto)
    If texto = vbNullString Then Exit Function

    For i = 1 To Len(texto)
        c = Mid$(texto, i, 1)
        If c < "0" Or c > "9" Then Exit Function
    Next i

    EhNumeroInteiroPositivo = True

End Function

' =====================================================
' LOCALIZAR AREA DA PROVA
' =====================================================
Private Function LocalizarAreaProva(ByVal doc As Document, ByRef rngInicioArea As Range, _
    ByRef rngFimArea As Range, ByRef analise As TAnaliseQuestoes) As Boolean

    Dim rngPagina2 As Range
    Dim i As Long
    Dim idxFim As Long
    Dim texto As String

    AnalisarSequenciaQuestoes doc, 0, analise
    If Not analise.Valida Then Exit Function

    idxFim = analise.IndiceUltimo

    For i = analise.IndiceUltimo To doc.Paragraphs.Count

        texto = LimparTexto(doc.Paragraphs(i).Range.Text)

        If i > analise.IndiceUltimo And EhMarcadorDepoisDaProva(texto) Then Exit For

        If texto <> vbNullString Or doc.Paragraphs(i).Range.InlineShapes.Count > 0 Then
            idxFim = i
        End If

    Next i

    Set rngInicioArea = doc.Paragraphs(analise.IndiceInicio).Range.Duplicate
    Set rngFimArea = doc.Paragraphs(idxFim).Range.Duplicate
    LocalizarAreaProva = True

End Function

' =====================================================
' ELEGIBILIDADE DO MODELO VAZIO
' =====================================================
Private Function DocumentoElegivelParaImportacao(ByVal doc As Document, _
    ByVal rngPagina2 As Range) As Boolean

    Dim rngPagina1 As Range
    Dim rngEspacoQuestoes As Range
    Dim posFim As Long
    Dim colunas As Long

    If TextoSignificativo(doc.Content.Text) = vbNullString And _
        doc.InlineShapes.Count = 0 And doc.Shapes.Count = 0 Then
        DocumentoElegivelParaImportacao = True
        Exit Function
    End If
    If Not ObterRangeDaPagina(doc, 1, rngPagina1) Then Exit Function
    If Len(TextoSignificativo(rngPagina1.Text)) < 30 Then Exit Function
    If TextoSignificativo(rngPagina2.Text) <> vbNullString Then Exit Function
    If rngPagina2.InlineShapes.Count > 0 Then Exit Function
    If ContarShapesNaoProtegidosNoRange(doc, rngPagina2) > 0 Then Exit Function

    On Error Resume Next
    colunas = rngPagina2.Sections(1).PageSetup.TextColumns.Count
    On Error GoTo 0

    If colunas < 1 Then Exit Function

    posFim = LocalizarInicioConteudoPosterior(doc, rngPagina2.Start)
    If posFim = 0 Then posFim = doc.Content.End

    Set rngEspacoQuestoes = doc.Range(Start:=rngPagina2.Start, End:=posFim)

    If TextoSignificativo(rngEspacoQuestoes.Text) <> vbNullString Then Exit Function
    If rngEspacoQuestoes.InlineShapes.Count > 0 Then Exit Function
    If ContarShapesNaoProtegidosNoRange(doc, rngEspacoQuestoes) > 0 Then Exit Function

    DocumentoElegivelParaImportacao = True

End Function

Private Function LocalizarInicioConteudoPosterior(ByVal doc As Document, _
    ByVal posicaoInicial As Long) As Long

    Dim p As Paragraph
    Dim texto As String

    For Each p In doc.Paragraphs
        If p.Range.Start >= posicaoInicial Then
            texto = LimparTexto(p.Range.Text)
            If EhMarcadorDepoisDaProva(texto) Then
                LocalizarInicioConteudoPosterior = p.Range.Start
                Exit Function
            End If
        End If
    Next p

End Function

Private Function ObterRangeDaPagina(ByVal doc As Document, ByVal numeroPagina As Long, _
    ByRef rngPagina As Range) As Boolean

    Dim totalPaginas As Long
    Dim inicio As Long
    Dim fim As Long
    Dim rngAux As Range

    On Error GoTo Falha

    totalPaginas = doc.ComputeStatistics(wdStatisticPages)
    If numeroPagina < 1 Or numeroPagina > totalPaginas Then Exit Function

    Set rngAux = doc.GoTo(What:=wdGoToPage, Which:=wdGoToAbsolute, Count:=numeroPagina)
    inicio = rngAux.Start

    If numeroPagina < totalPaginas Then
        Set rngAux = doc.GoTo(What:=wdGoToPage, Which:=wdGoToAbsolute, Count:=numeroPagina + 1)
        fim = rngAux.Start
    Else
        fim = doc.Content.End
    End If

    Set rngPagina = doc.Range(Start:=inicio, End:=fim)
    ObterRangeDaPagina = True
    Exit Function

Falha:
    ObterRangeDaPagina = False

End Function

' =====================================================
' SELECAO E IMPORTACAO DO ARQUIVO BRUTO
' =====================================================
Private Function SolicitarArquivoDeQuestoes() As String

    Dim resposta As VbMsgBoxResult
    Dim seletor As FileDialog

    resposta = MsgBox( _
        "Nenhuma sequencia de questoes foi encontrada e a segunda pagina esta vazia." & _
        vbCrLf & vbCrLf & _
        "Selecione agora o arquivo que contem as questoes brutas.", _
        vbOKCancel + vbInformation, "Importar questoes")

    If resposta <> vbOK Then Exit Function

    Set seletor = Application.FileDialog(msoFileDialogFilePicker)

    With seletor
        .AllowMultiSelect = False
        .Title = "Selecione o arquivo com as questoes brutas"
        .Filters.Clear
        .Filters.Add "Documentos do Word e texto", "*.doc;*.docx;*.docm;*.rtf;*.txt"
        .Filters.Add "Todos os arquivos", "*.*"

        If .Show <> -1 Then Exit Function
        SolicitarArquivoDeQuestoes = .SelectedItems(1)
    End With

End Function

Private Sub ValidarArquivoDeQuestoes(ByVal caminhoFonte As String, _
    ByRef quantidadeFonte As Long, _
    ByRef imagensFonte As Long, ByRef assinaturaFonte As String, ByRef formulasFonte As Long)

    On Error GoTo TratarErroValidacao

    Dim docFonte As Document
    Dim rngFonte As Range
    Dim analiseFonte As TAnaliseQuestoes
    Dim segurancaAnterior As MsoAutomationSecurity

    If Dir$(caminhoFonte) = vbNullString Then
        Err.Raise vbObjectError + 2100, , "O arquivo selecionado nao existe."
    End If

    segurancaAnterior = Application.AutomationSecurity
    Application.AutomationSecurity = msoAutomationSecurityForceDisable

    Set docFonte = Documents.Open( _
        FileName:=caminhoFonte, _
        ConfirmConversions:=False, _
        ReadOnly:=True, _
        AddToRecentFiles:=False, _
        Visible:=False, _
        OpenAndRepair:=False)

    Application.AutomationSecurity = segurancaAnterior

    AnalisarSequenciaQuestoes docFonte, 0, analiseFonte

    If Not analiseFonte.Valida Then
        Err.Raise vbObjectError + 2101, , _
            "O arquivo selecionado nao possui uma sequencia confiavel iniciando em 1."
    End If


    If docFonte.Sections.Count <> 1 Then
        Err.Raise vbObjectError + 2105, , _
            "O arquivo bruto possui quebras de secao. Remova-as antes da importacao " & _
            "para que o modelo nao seja alterado."
    End If

    quantidadeFonte = analiseFonte.quantidade

    Set rngFonte = RangeConteudoRegistrado(docFonte)

    formulasFonte = rngFonte.OMaths.Count
    assinaturaFonte = AssinaturaRangeSemMarcadores(rngFonte)
    imagensFonte = ContarImagensNoRangeDoDocumento(docFonte, rngFonte)

    If assinaturaFonte = vbNullString Then
        Err.Raise vbObjectError + 2103, , "O arquivo selecionado nao contem texto util."
    End If

    docFonte.Close SaveChanges:=wdDoNotSaveChanges
    Set docFonte = Nothing

    Exit Sub

TratarErroValidacao:

    Dim numeroErro As Long
    Dim descricaoErro As String

    numeroErro = Err.Number
    descricaoErro = Err.Description

    On Error Resume Next
    Application.AutomationSecurity = segurancaAnterior
    If Not docFonte Is Nothing Then docFonte.Close SaveChanges:=wdDoNotSaveChanges
    On Error GoTo 0

    Err.Raise numeroErro, "ValidarArquivoDeQuestoes", descricaoErro

End Sub

Private Sub InserirArquivoDeQuestoes(ByVal docDestino As Document, _
    ByVal posicaoInsercao As Long, ByVal caminhoFonte As String)

    Dim rngDestino As Range
    Dim rngImportado As Range
    Dim tamanhoAntes As Long
    Dim tamanhoDepois As Long
    Dim quantidadeInserida As Long
    Dim secoesAntes As Long

    tamanhoAntes = docDestino.Content.End
    secoesAntes = docDestino.Sections.Count

    Set rngDestino = docDestino.Range(Start:=posicaoInsercao, End:=posicaoInsercao)

    rngDestino.InsertFile _
        FileName:=caminhoFonte, _
        ConfirmConversions:=False, _
        Link:=False, _
        Attachment:=False

    tamanhoDepois = docDestino.Content.End
    quantidadeInserida = tamanhoDepois - tamanhoAntes

    If quantidadeInserida <= 0 Then
        Err.Raise vbObjectError + 2104, , _
            "O Word nao inseriu conteudo do arquivo selecionado."
    End If

    Set rngImportado = docDestino.Range( _
        Start:=posicaoInsercao, _
        End:=posicaoInsercao + quantidadeInserida)

    If docDestino.Sections.Count <> secoesAntes Then
        Err.Raise vbObjectError + 2106, , _
            "A importacao tentou alterar as secoes do modelo."
    End If

End Sub

' =====================================================
' FORMATACAO DO CONTEUDO BRUTO
' =====================================================
Private Sub FormatarQuestoesBrutas(ByVal doc As Document, ByVal rngInicioArea As Range, _
    ByVal rngFimArea As Range)

    Dim i As Long
    Dim texto As String
    Dim numero As Long
    Dim formatado As Boolean
    Dim rngTexto As Range
    Dim rngTotal As Range
    Dim shp As Shape
    Dim img As InlineShape

    ' Converte quebras manuais sem tocar fora da prova.
    Set rngTotal = doc.Range(Start:=rngInicioArea.Start, End:=rngFimArea.End)

    ' Evita Find/ReplaceAll em documentos com equacoes, que pode encerrar o Word.
    ' Altera somente a quebra manual real, de tras para frente e fora de OMath.
    Dim posQuebra As Long, quebra As Range, formula As OMath, dentroFormula As Boolean
    For posQuebra = rngTotal.End - 1 To rngTotal.Start Step -1
        Set quebra = doc.Range(posQuebra, posQuebra + 1)
        If quebra.Text = Chr$(11) Then
            dentroFormula = False
            For Each formula In rngTotal.OMaths
                If posQuebra >= formula.Range.Start And posQuebra < formula.Range.End Then
                    dentroFormula = True
                    Exit For
                End If
            Next formula
            If Not dentroFormula Then quebra.Text = vbCr
        End If
    Next posQuebra

    ' Substitui apenas o texto do paragrafo, preservando a marca e suas ancoras.
    Dim rTitulo As Range
    Dim prefixo As Long
    Dim restante As String
    For i = mTitulos.Count To 1 Step -1
        Set rTitulo = mTitulos(i)
        texto = LimparTexto(rTitulo.Paragraphs(1).Range.Text)
        numero = LerMarcador(texto, formatado, prefixo, restante)
        If numero > 0 And (texto <> "Quest" & ChrW$(&HE3) & "o " & Format$(numero, "00") Or Len(restante) > 0) Then
            Set rngTexto = rTitulo.Paragraphs(1).Range.Duplicate
            If Len(restante) = 0 Then
                rngTexto.End = rngTexto.End - 1
                If Right$(rngTexto.Text, 1) = vbCr Then rngTexto.End = rngTexto.End - 1
                rngTexto.Text = "Quest" & ChrW$(&HE3) & "o " & Format$(numero, "00")
            Else
                Dim inicial As String, espacosIniciais As Long
                inicial = rngTexto.Text
                espacosIniciais = 0
                Do While espacosIniciais < Len(inicial)
                    If InStr(" " & vbTab & ChrW$(160), Mid$(inicial, espacosIniciais + 1, 1)) = 0 Then Exit Do
                    espacosIniciais = espacosIniciais + 1
                Loop
                rngTexto.End = rngTexto.Start + prefixo + espacosIniciais
                rngTexto.Text = "Quest" & ChrW$(&HE3) & "o " & Format$(numero, "00") & vbCr
            End If
        End If
    Next i
    Dim analiseAtual As TAnaliseQuestoes
    AnalisarSequenciaQuestoes doc, 0, analiseAtual

    Set rngTotal = doc.Range(Start:=rngInicioArea.Start, End:=rngFimArea.End)

    With rngTotal
        .Font.Name = "Arial"
        .Font.Size = 9.5
        .Font.Color = wdColorBlack

        With .ParagraphFormat
            .Alignment = wdAlignParagraphJustify
            .SpaceBefore = 0
            .SpaceAfter = 0
            .LineSpacingRule = wdLineSpaceSingle
        End With
    End With

    FormatarTitulosDasQuestoes doc, rngInicioArea, rngFimArea
    NormalizarEspacosEstruturais doc, rngInicioArea, rngFimArea

    ' Converte somente imagens de conteudo. Separadores do modelo sao protegidos.
    For i = doc.Shapes.Count To 1 Step -1
        Set shp = doc.Shapes(i)

        If ShapeDentroDaArea(shp, rngInicioArea, rngFimArea) Then
            If EhShapeDeConteudoConversivel(shp) Then shp.ConvertToInlineShape
        End If
    Next i

    For Each img In doc.InlineShapes
        If ImagemDentroDaArea(img, rngInicioArea, rngFimArea) Then AjustarImagemSemAmpliar img
    Next img

    NormalizarEspacosEstruturais doc, rngInicioArea, rngFimArea

End Sub

Private Sub FormatarTitulosDasQuestoes(ByVal doc As Document, ByVal rngInicioArea As Range, _
    ByVal rngFimArea As Range)
    Dim r As Range
    For Each r In mTitulos
        With r.Paragraphs(1).Range
            .Font.Name = "Arial"
            .Font.Size = 10
            .Font.Bold = True
            .Font.AllCaps = True
            .Font.Color = wdColorBlack
            .ParagraphFormat.Alignment = wdAlignParagraphLeft
            .ParagraphFormat.LeftIndent = 0
            .ParagraphFormat.RightIndent = 0
            .ParagraphFormat.FirstLineIndent = 0
        End With
    Next r
End Sub

' =====================================================
' ESPACOS E ALTERNATIVAS
' =====================================================
Private Sub NormalizarEspacosEstruturais(ByVal doc As Document, _
    ByVal rngInicioArea As Range, ByVal rngFimArea As Range)
    Dim i As Long, p As Paragraph, anterior As Paragraph, inicio As Long
    inicio = rngInicioArea.Start
    For i = doc.Paragraphs.Count To 1 Step -1
        Set p = doc.Paragraphs(i)
        If p.Range.Start >= inicio And p.Range.Start < rngFimArea.End Then
            If ParagrafoVazioSeguro(p) Then
                Set anterior = p.Previous
                If Not anterior Is Nothing Then
                    If ParagrafoVazioSeguro(anterior) And anterior.Range.Start >= inicio Then p.Range.Delete
                End If
            End If
        End If
    Next i
    Dim visual As Range
    Set visual = RangeVisual(doc, rngInicioArea, rngFimArea)
    With visual.ParagraphFormat
        .SpaceBefore = 0
        .SpaceAfter = 0
        .SpaceBeforeAuto = False
        .SpaceAfterAuto = False
        .LineSpacingRule = wdLineSpaceSingle
    End With
    Dim tabela As Table
    For Each tabela In visual.Tables
        For Each p In tabela.Range.Paragraphs
            With p.Format
                .SpaceBefore = 0
                .SpaceAfter = 0
                .SpaceBeforeAuto = False
                .SpaceAfterAuto = False
                .LineSpacingRule = wdLineSpaceSingle
            End With
        Next p
    Next tabela
End Sub





Private Function EhAlternativaAConfirmada(ByVal doc As Document, ByVal indice As Long, _
    ByVal limiteFim As Long) As Boolean

    Dim letra As String
    Dim proximaLetra As String
    Dim j As Long
    Dim texto As String

    letra = LetraAlternativa(LimparTexto(doc.Paragraphs(indice).Range.Text))
    If letra <> "A" Then Exit Function

    For j = indice + 1 To doc.Paragraphs.Count
        If doc.Paragraphs(j).Range.Start > limiteFim Then Exit For

        texto = LimparTexto(doc.Paragraphs(j).Range.Text)

        If texto <> vbNullString Then
            proximaLetra = LetraAlternativa(texto)
            EhAlternativaAConfirmada = (proximaLetra = "B")
            Exit Function
        End If
    Next j

End Function

Private Function LetraAlternativa(ByVal texto As String) As String

    Dim segunda As String

    texto = Trim$(texto)
    If Len(texto) = 0 Then Exit Function

    LetraAlternativa = UCase$(Left$(texto, 1))
    If InStr(1, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", LetraAlternativa, vbBinaryCompare) = 0 Then
        LetraAlternativa = vbNullString
        Exit Function
    End If

    If Len(texto) = 1 Then Exit Function
    segunda = Mid$(texto, 2, 1)

    If segunda <> " " And segunda <> ")" And segunda <> "." And _
        segunda <> "-" And segunda <> ":" And segunda <> vbTab Then
        LetraAlternativa = vbNullString
    End If

End Function

Private Function CabecalhoImediatamenteAntes(ByVal p As Paragraph) As Boolean

    Dim anterior As Paragraph
    Dim passos As Long
    Dim texto As String

    Set anterior = p.Previous

    Do While Not anterior Is Nothing And passos < 3
        texto = LimparTexto(anterior.Range.Text)
        If texto <> vbNullString Then
            CabecalhoImediatamenteAntes = EhCabecalhoDeArea(texto)
            Exit Function
        End If
        passos = passos + 1
        Set anterior = anterior.Previous
    Loop

End Function

' =====================================================
' IMAGENS
' =====================================================
Private Function ObterLarguraColunaDoRange(ByVal rngReferencia As Range) As Double
    Dim sec As Section, i As Long, largura As Double
    Set sec = rngReferencia.Sections(1)
    largura = sec.PageSetup.PageWidth
    For i = 1 To sec.PageSetup.TextColumns.Count
        If sec.PageSetup.TextColumns(i).Width < largura Then largura = sec.PageSetup.TextColumns(i).Width
    Next i
    If rngReferencia.Information(wdWithInTable) Then
        On Error Resume Next
        If rngReferencia.Cells(1).Width < largura Then largura = rngReferencia.Cells(1).Width
        On Error GoTo 0
    End If
    ObterLarguraColunaDoRange = largura
End Function

Private Sub AjustarImagemSemAmpliar(ByVal img As InlineShape)

    Dim larguraMaxima As Double

    On Error Resume Next

    larguraMaxima = ObterLarguraColunaDoRange(img.Range)
    img.LockAspectRatio = msoTrue

    If img.Width > larguraMaxima Then img.Width = larguraMaxima

    With img.Range.ParagraphFormat
        .Alignment = wdAlignParagraphCenter
        .SpaceBefore = 0
        .SpaceAfter = 0
        .LineSpacingRule = wdLineSpaceSingle
    End With

    On Error GoTo 0

End Sub



Private Function EhShapeProtegido(ByVal shp As Shape) As Boolean

    Dim identificacao As String

    On Error Resume Next
    identificacao = UCase$(shp.Name & " " & shp.AlternativeText & " " & shp.Title)
    On Error GoTo 0

    If InStr(1, identificacao, "SEPARADOR_QUESTAO", vbTextCompare) > 0 Then
        EhShapeProtegido = True
    End If

End Function

Private Function EhShapeDeConteudoConversivel(ByVal shp As Shape) As Boolean

    On Error GoTo Falha

    If EhShapeProtegido(shp) Then Exit Function
    If shp.Anchor.StoryType <> wdMainTextStory Then Exit Function

    If shp.Type = msoPicture Or shp.Type = msoLinkedPicture Then
        EhShapeDeConteudoConversivel = True
    End If

Falha:

End Function

' =====================================================
' CABECALHOS DAS AREAS
' =====================================================
Private Sub InserirCabecalhosDasAreas(ByVal doc As Document)
    Dim i As Long, a As Variant, p As Paragraph, subTitulo As String
    RemoverCabecalhosObsoletos doc
    For i = mAreas.Count To 1 Step -1
        a = mAreas(i)
        Set p = EncontrarParagrafoQuestao(doc, CLng(a(0)))
        If Not p Is Nothing Then
            subTitulo = "Quest" & ChrW$(&HF5) & "es de " & Format$(a(0), "00") & " a " & Format$(a(1), "00")
            AssegurarCabecalhoAntesDaQuestao doc, CLng(a(0)), CStr(a(2)), subTitulo
        End If
    Next i
End Sub





Private Sub AssegurarCabecalhoAntesDaQuestao(ByVal doc As Document, ByVal numeroQuestao As Long, _
    ByVal tituloSecao As String, ByVal subtituloSecao As String)
    Dim pQ As Paragraph, pt As Paragraph, ps As Paragraph, anterior As Paragraph
    Dim r As Range, pos As Long, passos As Long
    Set pQ = EncontrarParagrafoQuestao(doc, numeroQuestao)
    If pQ Is Nothing Then Exit Sub
    Set anterior = pQ.Previous
    Do While Not anterior Is Nothing And passos < 4
        If EhTituloPrincipalArea(LimparTexto(anterior.Range.Text)) Then
            Set pt = anterior
            Set ps = ProximoParagrafoNaoVazio(pt)
            Exit Do
        End If
        If Not ParagrafoVazioSeguro(anterior) And Not EhCabecalhoDeArea(LimparTexto(anterior.Range.Text)) Then Exit Do
        passos = passos + 1
        Set anterior = anterior.Previous
    Loop
    If pt Is Nothing Then
        pos = pQ.Range.Start
        Set r = doc.Range(pos, pos)
        r.InsertBefore tituloSecao & vbCr & subtituloSecao & vbCr
        Set r = doc.Range(pos, pos + Len(tituloSecao) + Len(subtituloSecao) + 2)
        Set pt = r.Paragraphs(1)
        Set ps = r.Paragraphs(2)
    Else
        Set r = pt.Range.Duplicate
        r.MoveEnd wdCharacter, -1
        If r.Text <> tituloSecao Then r.Text = tituloSecao
        If Not ps Is Nothing Then
          If Left$(TextoNormalizado(ps.Range.Text), 12) = "QUESTOES DE " Then
            Set r = ps.Range.Duplicate
            r.MoveEnd wdCharacter, -1
            If r.Text <> subtituloSecao Then r.Text = subtituloSecao
          Else
            pos = pQ.Range.Start
            doc.Range(pos, pos).InsertBefore subtituloSecao & vbCr
            Set ps = doc.Range(pos, pos + Len(subtituloSecao) + 1).Paragraphs(1)
          End If
        End If
    End If
    FormatarCabecalhoSecao pt, ps
End Sub

Private Function ProximoParagrafoNaoVazio(ByVal p As Paragraph) As Paragraph

    Dim proximo As Paragraph

    Set proximo = p.Next

    Do While Not proximo Is Nothing
        If LimparTexto(proximo.Range.Text) <> vbNullString Then
            Set ProximoParagrafoNaoVazio = proximo
            Exit Function
        End If
        Set proximo = proximo.Next
    Loop

End Function

Private Sub FormatarCabecalhoSecao(ByVal pTitulo As Paragraph, ByVal pSubtitulo As Paragraph)

    If pTitulo Is Nothing Then Exit Sub

    With pTitulo.Range
        .Font.Name = "Arial"
        .Font.Size = 9.5
        .Font.Bold = True
        .Font.Color = wdColorBlack

        With .ParagraphFormat
            .Alignment = wdAlignParagraphLeft
                .LeftIndent = 0
                .RightIndent = 0
                .FirstLineIndent = 0
            .SpaceBefore = 0
            .SpaceAfter = 0
            .SpaceBeforeAuto = False
            .SpaceAfterAuto = False
            .LineSpacingRule = wdLineSpaceSingle
            .PageBreakBefore = False
            .KeepTogether = False
            .KeepWithNext = False
            .WidowControl = False
        End With
    End With

    If Not pSubtitulo Is Nothing Then
        With pSubtitulo.Range
            .Font.Name = "Arial"
            .Font.Size = 9.5
            .Font.Bold = False
            .Font.Color = wdColorBlack

            With .ParagraphFormat
                .Alignment = wdAlignParagraphLeft
                .LeftIndent = 0
                .RightIndent = 0
                .FirstLineIndent = 0
                .SpaceBefore = 0
                .SpaceAfter = 0
                .SpaceBeforeAuto = False
                .SpaceAfterAuto = False
                .LineSpacingRule = wdLineSpaceSingle
                .PageBreakBefore = False
                .KeepTogether = False
                .KeepWithNext = False
                .WidowControl = False
            End With
        End With
    End If

End Sub

' =====================================================
' LAYOUT: QUESTAO INTEIRA NA COLUNA/PAGINA
' =====================================================
Private Function EncontrarParagrafoQuestao(ByVal doc As Document, _
    ByVal numeroQuestao As Long) As Paragraph
    Dim r As Range
    If mTitulos Is Nothing Then Exit Function
    If Not mDocAnalise Is doc Then Exit Function
    If numeroQuestao < 1 Or numeroQuestao > mTitulos.Count Then Exit Function
    Set r = mTitulos(numeroQuestao)
    Set EncontrarParagrafoQuestao = r.Paragraphs(1)
End Function

Private Function EncontrarParagrafoPorTextoNormalizado(ByVal doc As Document, _
    ByVal TextoNormalizado As String) As Paragraph

    Dim p As Paragraph
    Dim atual As String
    Dim parteNumero As String

    TextoNormalizado = RemoverAcentos(UCase$(Trim$(TextoNormalizado)))

    If Left$(TextoNormalizado, 8) = "QUESTAO " Then
        parteNumero = Trim$(Mid$(TextoNormalizado, 9))

        If EhNumeroInteiroPositivo(parteNumero) Then
            Set EncontrarParagrafoPorTextoNormalizado = _
                EncontrarParagrafoQuestao(doc, CLng(parteNumero))
            Exit Function
        End If
    End If

    For Each p In doc.Paragraphs
        atual = RemoverAcentos(UCase$(LimparTexto(p.Range.Text)))

        If atual = TextoNormalizado Then
            Set EncontrarParagrafoPorTextoNormalizado = p
            Exit Function
        End If
    Next p

End Function



Private Function IndiceFluxoVisual(ByVal rng As Range) As Long

    IndiceFluxoVisual = (rng.Information(wdActiveEndPageNumber) * 10) + _
        ObterIndiceColunaVisual(rng)

End Function

Private Function ObterTopoVisual(ByVal doc As Document) As Double

    Dim p As Paragraph

    Set p = EncontrarParagrafoPorTextoNormalizado( _
        doc, "LINGUAGENS, CODIGOS E SUAS TECNOLOGIAS")

    If Not p Is Nothing Then
        ObterTopoVisual = p.Range.Information(wdVerticalPositionRelativeToPage)
    Else
        ObterTopoVisual = 48
    End If

End Function

Private Function ObterBaseVisual(ByVal rng As Range) As Double

    Dim sec As Section

    On Error Resume Next
    Set sec = rng.Sections(1)
    On Error GoTo 0

    If sec Is Nothing Then
        ObterBaseVisual = 780
    Else
        ObterBaseVisual = sec.PageSetup.PageHeight - _
            sec.PageSetup.FooterDistance - 25
    End If

End Function





Private Sub ApararFimVazioDoRange(ByRef rng As Range)

    Dim i As Long
    Dim p As Paragraph

    For i = rng.Paragraphs.Count To 1 Step -1
        Set p = rng.Paragraphs(i)

        If LimparTexto(p.Range.Text) <> vbNullString Or p.Range.InlineShapes.Count > 0 Then
            rng.End = p.Range.End
            Exit Sub
        End If
    Next i

End Sub

Private Function QuestaoEstaFragmentada(ByVal rngQuestao As Range) As Boolean

    Dim rngInicio As Range
    Dim rngFim As Range
    Dim paginaInicio As Long
    Dim paginaFim As Long
    Dim colunaInicio As Long
    Dim colunaFim As Long

    If rngQuestao.Start >= rngQuestao.End Then Exit Function

    Set rngInicio = rngQuestao.Duplicate
    rngInicio.Collapse wdCollapseStart

    Set rngFim = rngQuestao.Duplicate
    If rngFim.End > rngFim.Start Then rngFim.MoveEnd wdCharacter, -1
    rngFim.Collapse wdCollapseEnd

    paginaInicio = rngInicio.Information(wdActiveEndPageNumber)
    paginaFim = rngFim.Information(wdActiveEndPageNumber)

    If paginaInicio <> paginaFim Then
        QuestaoEstaFragmentada = True
        Exit Function
    End If

    colunaInicio = ObterIndiceColunaVisual(rngInicio)
    colunaFim = ObterIndiceColunaVisual(rngFim)

    QuestaoEstaFragmentada = (colunaInicio <> colunaFim)

End Function

Private Function ObterIndiceColunaVisual(ByVal rng As Range) As Long
    Dim sec As Section, x As Double, inicio As Double, i As Long, c As TextColumn, espaco As Double
    On Error GoTo Falha
    Set sec = rng.Sections(1)
    x = rng.Information(wdHorizontalPositionRelativeToPage)
    inicio = sec.PageSetup.LeftMargin + sec.PageSetup.Gutter
    For i = 1 To sec.PageSetup.TextColumns.Count
        Set c = sec.PageSetup.TextColumns(i)
        espaco = 0
        If i < sec.PageSetup.TextColumns.Count Then espaco = c.SpaceAfter
        If x <= inicio + c.Width + espaco / 2 Then
            ObterIndiceColunaVisual = i
            Exit Function
        End If
        inicio = inicio + c.Width + espaco
    Next i
    ObterIndiceColunaVisual = sec.PageSetup.TextColumns.Count
    Exit Function
Falha:
    ObterIndiceColunaVisual = 1
End Function

' =====================================================
' VALIDACOES DE CONTEUDO
' =====================================================


Private Sub RegistrarFalhaFluxo(ByVal p As Paragraph, ByVal motivo As String)

    Dim texto As String

    texto = LimparTexto(p.Range.Text)
    If Len(texto) > 90 Then texto = Left$(texto, 90) & "..."
    If texto = vbNullString Then texto = "[parágrafo vazio]"

    mDetalheAuditoria = motivo & " | posição " & CStr(p.Range.Start) & _
        " | " & texto

End Sub

Private Function AssinaturaConteudoQuestoes(ByVal doc As Document, _
    ByVal rngInicioArea As Range, ByVal rngFimArea As Range) As String

    Dim rng As Range

    Set rng = doc.Range(Start:=rngInicioArea.Start, End:=rngFimArea.End)
    AssinaturaConteudoQuestoes = AssinaturaRangeSemMarcadores(rng)

End Function

Private Function AssinaturaRangeSemMarcadores(ByVal rng As Range) As String
    Dim p As Paragraph, r As Range, chaves As Object, texto As String
    Dim prefixo As Long, resto As String, f As Boolean, n As Long
    Dim acumulado As String
    Set chaves = CreateObject("Scripting.Dictionary")
    If Not mTitulos Is Nothing Then
        If mDocAnalise Is rng.Document Then
            For Each r In mTitulos
                chaves(CStr(r.Start)) = True
            Next r
        End If
    End If
    For Each p In rng.Paragraphs
        texto = TextoDoParagrafoSemImagens(p)
        If chaves.Exists(CStr(p.Range.Start)) Then
            n = LerMarcador(LimparTexto(texto), f, prefixo, resto)
            acumulado = acumulado & TextoSignificativo(resto)
        ElseIf Not EhCabecalhoDeArea(LimparTexto(texto)) Then
            acumulado = acumulado & TextoSignificativo(texto)
        End If
    Next p
    AssinaturaRangeSemMarcadores = acumulado
End Function

Private Function TextoDoParagrafoSemImagens(ByVal p As Paragraph) As String

    Dim texto As String
    Dim i As Long
    Dim inicioRelativo As Long
    Dim tamanho As Long
    Dim img As InlineShape

    texto = p.Range.Text

    For i = p.Range.InlineShapes.Count To 1 Step -1
        Set img = p.Range.InlineShapes(i)
        inicioRelativo = img.Range.Start - p.Range.Start + 1
        tamanho = img.Range.End - img.Range.Start

        If inicioRelativo >= 1 And inicioRelativo <= Len(texto) Then
            texto = Left$(texto, inicioRelativo - 1) & _
                Mid$(texto, inicioRelativo + tamanho)
        End If
    Next i

    TextoDoParagrafoSemImagens = texto

End Function

Private Function ContarImagensDeConteudo(ByVal doc As Document, _
    ByVal rngInicioArea As Range, ByVal rngFimArea As Range) As Long

    Dim rng As Range

    Set rng = doc.Range(Start:=rngInicioArea.Start, End:=rngFimArea.End)
    ContarImagensDeConteudo = ContarImagensNoRangeDoDocumento(doc, rng)

End Function

Private Function ContarImagensNoRangeDoDocumento(ByVal doc As Document, ByVal rng As Range) As Long

    Dim total As Long
    Dim shp As Shape

    total = rng.InlineShapes.Count

    For Each shp In doc.Shapes
        If shp.Anchor.Start >= rng.Start And shp.Anchor.Start <= rng.End Then
            If EhShapeDeConteudoConversivel(shp) Then total = total + 1
        End If
    Next shp

    ContarImagensNoRangeDoDocumento = total

End Function

Private Function ContarSeparadoresProtegidos(ByVal doc As Document) As Long

    Dim shp As Shape

    For Each shp In doc.Shapes
        If EhShapeProtegido(shp) Then
            ContarSeparadoresProtegidos = ContarSeparadoresProtegidos + 1
        End If
    Next shp

End Function

Private Function ContarShapesNaoProtegidosNoRange(ByVal doc As Document, ByVal rng As Range) As Long

    Dim shp As Shape

    For Each shp In doc.Shapes
        If shp.Anchor.Start >= rng.Start And shp.Anchor.Start < rng.End Then
            If Not EhShapeProtegido(shp) Then
                ContarShapesNaoProtegidosNoRange = ContarShapesNaoProtegidosNoRange + 1
            End If
        End If
    Next shp

End Function

' =====================================================
' FUNCOES GERAIS
' =====================================================
Private Function LimparTexto(ByVal texto As String) As String

    texto = Replace(texto, vbCr, vbNullString)
    texto = Replace(texto, vbLf, vbNullString)
    texto = Replace(texto, Chr$(11), vbNullString)
    texto = Replace(texto, Chr$(13), vbNullString)
    texto = Replace(texto, Chr$(7), vbNullString)
    texto = Replace(texto, Chr$(12), vbNullString)
    texto = Replace(texto, Chr$(14), vbNullString)
    texto = Replace(texto, vbTab, " ")
    texto = Replace(texto, ChrW$(160), " ")
    LimparTexto = Trim$(texto)

End Function

Private Function TextoSignificativo(ByVal texto As String) As String

    texto = Replace(texto, vbCr, vbNullString)
    texto = Replace(texto, vbLf, vbNullString)
    texto = Replace(texto, vbTab, vbNullString)
    texto = Replace(texto, " ", vbNullString)
    texto = Replace(texto, Chr$(1), vbNullString)
    texto = Replace(texto, Chr$(7), vbNullString)
    texto = Replace(texto, Chr$(11), vbNullString)
    texto = Replace(texto, Chr$(12), vbNullString)
    texto = Replace(texto, Chr$(13), vbNullString)
    texto = Replace(texto, ChrW$(160), vbNullString)
    TextoSignificativo = texto

End Function

Private Function RemoverAcentos(ByVal texto As String) As String

    texto = Replace(texto, ChrW$(&HC0), "A")
    texto = Replace(texto, ChrW$(&HC1), "A")
    texto = Replace(texto, ChrW$(&HC2), "A")
    texto = Replace(texto, ChrW$(&HC3), "A")
    texto = Replace(texto, ChrW$(&HC4), "A")
    texto = Replace(texto, ChrW$(&HC8), "E")
    texto = Replace(texto, ChrW$(&HC9), "E")
    texto = Replace(texto, ChrW$(&HCA), "E")
    texto = Replace(texto, ChrW$(&HCB), "E")
    texto = Replace(texto, ChrW$(&HCC), "I")
    texto = Replace(texto, ChrW$(&HCD), "I")
    texto = Replace(texto, ChrW$(&HCE), "I")
    texto = Replace(texto, ChrW$(&HCF), "I")
    texto = Replace(texto, ChrW$(&HD2), "O")
    texto = Replace(texto, ChrW$(&HD3), "O")
    texto = Replace(texto, ChrW$(&HD4), "O")
    texto = Replace(texto, ChrW$(&HD5), "O")
    texto = Replace(texto, ChrW$(&HD6), "O")
    texto = Replace(texto, ChrW$(&HD9), "U")
    texto = Replace(texto, ChrW$(&HDA), "U")
    texto = Replace(texto, ChrW$(&HDB), "U")
    texto = Replace(texto, ChrW$(&HDC), "U")
    texto = Replace(texto, ChrW$(&HC7), "C")
    RemoverAcentos = texto

End Function

Private Function EhCabecalhoDeArea(ByVal texto As String) As Boolean
    If EhTituloPrincipalArea(texto) Then
        EhCabecalhoDeArea = True
    ElseIf Left$(TextoNormalizado(texto), 12) = "QUESTOES DE " Then
        EhCabecalhoDeArea = True
    End If
End Function

Private Function EhTituloPrincipalArea(ByVal texto As String) As Boolean
    Dim a As Variant, t As String
    t = TextoNormalizado(texto)
    If Not mAreas Is Nothing Then
        For Each a In mAreas
            If t = TextoNormalizado(CStr(a(2))) Then
                EhTituloPrincipalArea = True
                Exit Function
            End If
        Next a
    End If
    If Not mNomesAreasAnteriores Is Nothing Then
        For Each a In mNomesAreasAnteriores
            If t = TextoNormalizado(CStr(a)) Then
                EhTituloPrincipalArea = True
                Exit Function
            End If
        Next a
    End If
    Select Case t
        Case "LINGUAGENS, CODIGOS E SUAS TECNOLOGIAS", "MATEMATICA E SUAS TECNOLOGIAS", _
            "CIENCIAS DA NATUREZA E SUAS TECNOLOGIAS", "CIENCIAS HUMANAS E SUAS TECNOLOGIAS", "QUESTOES"
            EhTituloPrincipalArea = True
    End Select
End Function

Private Function EhMarcadorDepoisDaProva(ByVal texto As String) As Boolean

    Dim t As String

    t = RemoverAcentos(UCase$(Trim$(texto)))
    If t = vbNullString Then Exit Function

    If InStr(1, t, "PROPOSTA DE REDACAO", vbTextCompare) > 0 Then
        EhMarcadorDepoisDaProva = True
    ElseIf InStr(1, t, "RASCUNHO DA REDACAO", vbTextCompare) > 0 Then
        EhMarcadorDepoisDaProva = True
    ElseIf InStr(1, t, "FOLHA DE REDACAO", vbTextCompare) > 0 Then
        EhMarcadorDepoisDaProva = True
    End If

End Function

Private Function ParagrafoDentroArea(ByVal p As Paragraph, ByVal rngInicioArea As Range, _
    ByVal rngFimArea As Range) As Boolean

    ParagrafoDentroArea = (p.Range.Start >= rngInicioArea.Start And _
        p.Range.Start <= rngFimArea.End)

End Function

Private Function ImagemDentroDaArea(ByVal img As InlineShape, ByVal rngInicioArea As Range, _
    ByVal rngFimArea As Range) As Boolean

    ImagemDentroDaArea = (img.Range.Start >= rngInicioArea.Start And _
        img.Range.Start <= rngFimArea.End)

End Function

Private Function ShapeDentroDaArea(ByVal shp As Shape, ByVal rngInicioArea As Range, _
    ByVal rngFimArea As Range) As Boolean

    On Error GoTo Falha
    ShapeDentroDaArea = (shp.Anchor.Start >= rngInicioArea.Start And _
        shp.Anchor.Start <= rngFimArea.End)
Falha:

End Function

Private Function NormalizarCaminho(ByVal caminho As String) As String

    On Error Resume Next
    NormalizarCaminho = LCase$(CreateObject("Scripting.FileSystemObject").GetAbsolutePathName(caminho))
    If Err.Number <> 0 Then NormalizarCaminho = LCase$(caminho)
    On Error GoTo 0

End Function

Private Function LerMarcador(ByVal texto As String, ByRef formatado As Boolean, _
    ByRef prefixo As Long, ByRef restante As String) As Long
    Dim rx As Object, mt As Object, t As String, digitos As String, inicio As Long
    formatado = False: prefixo = 0: restante = vbNullString
    t = Trim$(texto)
    If Len(t) = 0 Then Exit Function
    Set rx = CreateObject("VBScript.RegExp")
    rx.IgnoreCase = True
    rx.Pattern = "^Quest[ao\xE3][o]?\s*(?:n[.o\xBA\xB0]*\s*)?[#:.\-\s]*(\d{1,4})(?:[.):\-\xBA\xB0]*)(?:\s+(.*))?$"
    ' A forma canonica e Questao/Questão; o prefixo tambem aceita n., nº e #.
    If rx.Test(t) Then
        Set mt = rx.Execute(t)(0)
        digitos = mt.SubMatches(0)
        restante = mt.SubMatches(1)
        formatado = True
    Else
        rx.Pattern = "^(\d{1,4})[.):\-\xBA\xB0]*$"
        If rx.Test(t) Then
            Set mt = rx.Execute(t)(0)
            digitos = mt.SubMatches(0)
        Else
            rx.Pattern = "^(\d{1,4})[.):\-]\s+(.+)$"
            If Not rx.Test(t) Then Exit Function
            Set mt = rx.Execute(t)(0)
            digitos = mt.SubMatches(0)
            restante = mt.SubMatches(1)
        End If
    End If
    If Len(digitos) = 0 Then Exit Function
    LerMarcador = CLng(digitos)
    If LerMarcador < 1 Or LerMarcador > MAXIMO_QUESTOES_VALIDAS Then
        LerMarcador = 0
        Exit Function
    End If
    prefixo = Len(t) - Len(restante)
End Function

Private Function TextoNormalizado(ByVal texto As String) As String
    TextoNormalizado = RemoverAcentos(UCase$(LimparTexto(texto)))
End Function

Private Function ObterEspacoImportacao(ByVal doc As Document, ByRef espaco As Range) As Boolean
    Dim sec As Section, pos As Long, fim As Long
    If doc.Bookmarks.Exists("AREA_QUESTOES") Then
        Set espaco = doc.Bookmarks("AREA_QUESTOES").Range.Duplicate
        ObterEspacoImportacao = True
        Exit Function
    End If
    If TextoSignificativo(doc.Content.Text) = vbNullString And _
        doc.InlineShapes.Count = 0 And doc.Shapes.Count = 0 Then
        Set espaco = doc.Content.Duplicate
        ObterEspacoImportacao = True
        Exit Function
    End If
    For Each sec In doc.Sections
        If sec.Index > 1 Then
            pos = sec.Range.Start
            fim = LocalizarInicioConteudoPosterior(doc, pos)
            If fim = 0 Then fim = doc.Content.End
            Set espaco = doc.Range(pos, fim)
            If TextoSignificativo(espaco.Text) = vbNullString Then
                If espaco.InlineShapes.Count = 0 And ContarShapesNaoProtegidosNoRange(doc, espaco) = 0 Then
                    ObterEspacoImportacao = True
                    Exit Function
                End If
            End If
        End If
    Next sec
    ObterEspacoImportacao = ObterRangeDaPagina(doc, 2, espaco)
End Function

Private Function RangeConteudoRegistrado(ByVal doc As Document) As Range
    Dim inicio As Long, fim As Long, p As Paragraph
    inicio = mTitulos(1).Start
    fim = doc.Content.End - 1
    For Each p In doc.Paragraphs
        If p.Range.Start > inicio Then
            If EhMarcadorDepoisDaProva(LimparTexto(p.Range.Text)) Then
                fim = p.Range.Start
                Exit For
            End If
        End If
    Next p
    Set RangeConteudoRegistrado = doc.Range(inicio, fim)
End Function

Private Function LerVariavel(ByVal doc As Document, ByVal nome As String) As String
    On Error Resume Next
    LerVariavel = doc.Variables(nome).Value
    On Error GoTo 0
End Function

Private Sub GravarVariavel(ByVal doc As Document, ByVal nome As String, ByVal valor As String)
    Dim v As Variable
    On Error Resume Next
    Set v = doc.Variables(nome)
    On Error GoTo 0
    If v Is Nothing Then
        doc.Variables.Add nome, valor
    Else
        v.Value = valor
    End If
End Sub

Private Sub DefinirAreas(ByVal doc As Document, ByVal quantidade As Long)
    Dim cfg As String, itens As Variant, partes As Variant, item As Variant
    Dim candidatos As Collection, inicio As Long, ultimo As Long, titulo As String
    Dim rx As Object, mt As Object, p As Paragraph, i As Long, a As Variant, b As Variant
    Set candidatos = New Collection
    cfg = LerVariavel(doc, "GSS_AREAS")
    If Len(Trim$(cfg)) = 0 And LerVariavel(doc, "GSS_REDETECTAR_AREAS") <> "1" Then cfg = LerVariavel(doc, "GSS_AREAS_DETECTADAS")
    If Len(Trim$(cfg)) > 0 Then
        itens = Split(cfg, ";")
        For Each item In itens
            partes = Split(CStr(item), "|")
            If UBound(partes) <> 1 Then Err.Raise vbObjectError + 2200, , "Areas: use inicio|titulo;inicio|titulo."
            If Not EhNumeroInteiroPositivo(Trim$(partes(0))) Then Err.Raise vbObjectError + 2201, , "Inicio de area invalido."
            If Len(Trim$(partes(0))) > 4 Then Err.Raise vbObjectError + 2201, , "Inicio de area invalido."
            inicio = CLng(Trim$(partes(0)))
            titulo = Trim$(partes(1))
            If inicio <= ultimo Or Len(titulo) = 0 Then Err.Raise vbObjectError + 2202, , "As areas devem estar em ordem, com titulos nao vazios."
            If candidatos.Count = 0 And inicio <> 1 Then Err.Raise vbObjectError + 2203, , "A primeira area deve comecar na questao 1."
            candidatos.Add Array(inicio, titulo)
            ultimo = inicio
        Next item
    Else
        ' Respeita os cabecalhos de area que ja estao junto das questoes.
        ultimo = 0
        For i = 1 To mTitulos.Count
            Set p = mTitulos(i).Paragraphs(1).Previous
            Dim passos As Long
            passos = 0
            Do While Not p Is Nothing And passos < 4
                titulo = LimparTexto(p.Range.Text)
                If EhTituloPrincipalArea(titulo) Then
                    candidatos.Add Array(i, titulo)
                    ultimo = i
                    Exit Do
                End If
                If Not ParagrafoVazioSeguro(p) And Left$(TextoNormalizado(titulo), 12) <> "QUESTOES DE " Then Exit Do
                Set p = p.Previous
                passos = passos + 1
            Loop
        Next i
        If candidatos.Count = 0 Then
            Set rx = CreateObject("VBScript.RegExp")
            rx.IgnoreCase = True
            rx.Pattern = "Quest.es de n.mero\s+(\d{1,4})\s+a\s+(\d{1,4}).*?rea de\s+(.+?)(?:;|\.|$)"
            For Each p In doc.Paragraphs
                If p.Range.Start >= mTitulos(1).Start Then Exit For
                If rx.Test(LimparTexto(p.Range.Text)) Then
                    Set mt = rx.Execute(LimparTexto(p.Range.Text))(0)
                    inicio = CLng(mt.SubMatches(0))
                    titulo = Trim$(mt.SubMatches(2))
                    If inicio > ultimo Then
                        candidatos.Add Array(inicio, UCase$(titulo))
                        ultimo = inicio
                    End If
                End If
            Next p
        End If
    End If
    Set mAreas = New Collection
    If candidatos.Count = 0 Then candidatos.Add Array(1, "QUEST" & ChrW$(&HD5) & "ES")
    a = candidatos(1)
    If CLng(a(0)) <> 1 Then mAreas.Add Array(1, CLng(a(0)) - 1, "QUEST" & ChrW$(&HD5) & "ES")
    For i = 1 To candidatos.Count
        a = candidatos(i)
        If CLng(a(0)) <= quantidade Then
            ultimo = quantidade
            If i < candidatos.Count Then
                b = candidatos(i + 1)
                If CLng(b(0)) - 1 < ultimo Then ultimo = CLng(b(0)) - 1
            End If
            mAreas.Add Array(CLng(a(0)), ultimo, CStr(a(1)))
        End If
    Next i
End Sub

Private Sub SalvarConfiguracaoDetectada(ByVal doc As Document)
    Dim cfg As String, a As Variant
    For Each a In mAreas
        If Len(cfg) > 0 Then cfg = cfg & ";"
        cfg = cfg & CStr(a(0)) & "|" & CStr(a(2))
    Next a
    GravarVariavel doc, "GSS_AREAS_DETECTADAS", cfg
    GravarVariavel doc, "GSS_REDETECTAR_AREAS", "0"
End Sub

Public Sub CONFIGURAR_AREAS_DO_SIMULADO()
    Dim valor As String, doc As Document
    Set doc = ActiveDocument
    valor = InputBox("Opcional: informe a primeira questao e o titulo de cada area." & vbCrLf & _
        "Exemplo: 1|Linguagens;18|Matematica;23|Natureza;27|Humanas" & vbCrLf & _
        "Use AUTO para voltar a detectar pela capa. Cancelar preserva a configuracao.", _
        "Areas do simulado", LerVariavel(doc, "GSS_AREAS"))
    If Len(valor) = 0 Then Exit Sub
    If UCase$(Trim$(valor)) = "AUTO" Then
        GravarVariavel doc, "GSS_AREAS", " "
        GravarVariavel doc, "GSS_REDETECTAR_AREAS", "1"
    Else
        GravarVariavel doc, "GSS_AREAS", valor
        GravarVariavel doc, "GSS_REDETECTAR_AREAS", "0"
    End If
End Sub

Private Function ParagrafoVazioSeguro(ByVal p As Paragraph) As Boolean
    If p Is Nothing Then Exit Function
    If Len(LimparTexto(p.Range.Text)) > 0 Then Exit Function
    If InStr(p.Range.Text, Chr$(12)) > 0 Or InStr(p.Range.Text, Chr$(14)) > 0 Then Exit Function
    If p.Range.InlineShapes.Count > 0 Or p.Range.OMaths.Count > 0 Then Exit Function
    If p.Range.Tables.Count > 0 Then Exit Function
    If ContarAncorasNoRange(p.Range.Document, p.Range) > 0 Then Exit Function
    ParagrafoVazioSeguro = True
End Function

Private Function RangeVisual(ByVal doc As Document, ByVal inicio As Range, ByVal fim As Range) As Range
    Dim pos As Long, p As Paragraph, passos As Long
    pos = inicio.Start
    Set p = inicio.Paragraphs(1).Previous
    Do While Not p Is Nothing And passos < 4
        If EhCabecalhoDeArea(LimparTexto(p.Range.Text)) Or ParagrafoVazioSeguro(p) Then
            pos = p.Range.Start
        Else
            Exit Do
        End If
        passos = passos + 1
        Set p = p.Previous
    Loop
    Set RangeVisual = doc.Range(pos, fim.End)
End Function

Private Function RangeQuestaoAtual(ByVal doc As Document, ByVal indice As Long) As Range
    Dim fim As Long, r As Range, p As Paragraph
    If indice < mTitulos.Count Then
        fim = mTitulos(indice + 1).Start
    Else
        fim = LocalizarInicioConteudoPosterior(doc, mTitulos(indice).Start)
        If fim = 0 Then fim = doc.Content.End - 1
    End If
    Set r = doc.Range(mTitulos(indice).Start, fim)
    For Each p In r.Paragraphs
        If p.Range.Start > r.Start Then
            If EhCabecalhoDeArea(LimparTexto(p.Range.Text)) Then
                r.End = p.Range.Start
                Exit For
            End If
        End If
    Next p
    ApararFimVazioDoRange r
    Set RangeQuestaoAtual = r
End Function

Private Sub Repaginar(ByVal doc As Document)
    doc.Repaginate
    mRepaginacoes = mRepaginacoes + 1
End Sub

Private Function SegundosDecorridos() As Double
    SegundosDecorridos = Timer - mInicioExecucao
    If SegundosDecorridos < 0 Then SegundosDecorridos = SegundosDecorridos + 86400
End Function

Private Function AlturaUtil(ByVal r As Range) As Double
    With r.Sections(1).PageSetup
        AlturaUtil = .PageHeight - .TopMargin - .BottomMargin
    End With
End Function

Private Function AlturaEstimada(ByVal r As Range) As Double
    Dim p As Paragraph, ri As Range, rf As Range, altura As Double, total As Double
    Dim f1 As Long, f2 As Long, cols As Long, img As InlineShape, maxImg As Double
    cols = r.Sections(1).PageSetup.TextColumns.Count
    For Each p In r.Paragraphs
        Set ri = p.Range.Duplicate: ri.Collapse wdCollapseStart
        Set rf = p.Range.Duplicate
        If rf.End - rf.Start > 1 Then rf.MoveEnd wdCharacter, -2
        rf.Collapse wdCollapseEnd
        f1 = (ri.Information(wdActiveEndPageNumber) - 1) * cols + ObterIndiceColunaVisual(ri)
        f2 = (rf.Information(wdActiveEndPageNumber) - 1) * cols + ObterIndiceColunaVisual(rf)
        altura = (f2 - f1) * AlturaUtil(r) + _
            rf.Information(wdVerticalPositionRelativeToPage) - ri.Information(wdVerticalPositionRelativeToPage) + 12
        maxImg = 0
        For Each img In p.Range.InlineShapes
            If img.Height > maxImg Then maxImg = img.Height
        Next img
        If maxImg + 4 > altura Then altura = maxImg + 4
        If altura < 10 Then altura = 10
        total = total + altura
    Next p
    AlturaEstimada = total
End Function

Private Sub ManterBlocoInteiro(ByVal r As Range)
    Dim p As Paragraph, ultimo As Long
    ultimo = r.Paragraphs(r.Paragraphs.Count).Range.Start
    With r.ParagraphFormat
        .KeepTogether = True
        .KeepWithNext = False
    End With
    For Each p In r.Paragraphs
        If p.Range.Start < ultimo Then p.Format.KeepWithNext = True
    Next p
End Sub

Private Sub LiberarBlocoLongo(ByVal r As Range)
    Dim p As Paragraph, encontrouConteudo As Boolean
    With r.ParagraphFormat
        .KeepTogether = False
        .KeepWithNext = False
    End With
    ' O titulo, os vazios seguintes e a primeira imagem ficam ligados ao texto inicial.
    For Each p In r.Paragraphs
        If p.Range.Start = r.Start Or ParagrafoVazioSeguro(p) Then
            p.Format.KeepWithNext = True
        ElseIf p.Range.InlineShapes.Count > 0 And Len(TextoSignificativo(TextoDoParagrafoSemImagens(p))) = 0 Then
            p.Format.KeepTogether = True
            p.Format.KeepWithNext = True
        Else
            Exit For
        End If
    Next p
End Sub

Private Sub AplicarLayoutInteligenteQuestoes(ByVal doc As Document, ByVal rngInicioArea As Range, _
    ByVal rngFimArea As Range, ByVal primeiraExecucao As Boolean)
    Dim visual As Range, r As Range, p As Paragraph, a As Variant, i As Long
    Dim ajustar As Boolean, img As InlineShape, limite As Double
    Set visual = RangeVisual(doc, rngInicioArea, rngFimArea)
    With visual.ParagraphFormat
        .KeepWithNext = False
        .KeepTogether = False
        .WidowControl = False
        .PageBreakBefore = False
    End With
    ' Preserva quebras explicitas do autor. A macro nao cria quebras de secao/coluna.
    For Each a In mAreas
        Set p = CabecalhoDaQuestao(doc, CLng(a(0)), CStr(a(2)))
        If Not p Is Nothing Then
            p.Format.KeepTogether = True
            p.Format.KeepWithNext = True
            p.Format.PageBreakBefore = (CLng(a(0)) <> 1)
            Set p = ProximoParagrafoNaoVazio(p)
            If Not p Is Nothing Then
                p.Format.KeepTogether = True
                p.Format.KeepWithNext = True
            End If
        End If
    Next a
    ' Liga a linha antes de cada titulo ao bloco seguinte, inclusive no inicio de area.
    Dim titulo As Range
    For Each titulo In mTitulos
        Set p = titulo.Paragraphs(1).Previous
        If Not p Is Nothing Then
            If ParagrafoVazioSeguro(p) Then
                p.Format.KeepTogether = True
                p.Format.KeepWithNext = True
            End If
        End If
    Next titulo
    For Each img In visual.InlineShapes
        AjustarImagemSemAmpliar img
        limite = AlturaUtil(img.Range) - 70
        If limite > 30 And img.Height > limite Then img.Height = limite
    Next img
    Repaginar doc
    For i = 1 To mTitulos.Count
        Set r = RangeQuestaoAtual(doc, i)
        ManterBlocoInteiro r
    Next i
    Repaginar doc
    For i = 1 To mTitulos.Count
        Set r = RangeQuestaoAtual(doc, i)
        If QuestaoEstaFragmentada(r) Then
            If AlturaEstimada(r) > AlturaUtil(r) - 16 Then
                LiberarBlocoLongo r
                mExcecoes.Add CStr(i), CStr(i)
                ajustar = True
            End If
        End If
    Next i
    If ajustar Then Repaginar doc
    RemoverLinhasAntesDosTitulosNoTopo doc
End Sub


' Uma linha separa questoes consecutivas; o topo da coluna nao recebe linha vazia.
' Usa a posicao real do ultimo conteudo anterior, incluindo paragrafos longos.
' Os cabecalhos de area e as quebras explicitas continuam preservados.
Private Sub RemoverLinhasAntesDosTitulosNoTopo(ByVal doc As Document)
    Dim i As Long, passagem As Long, removeu As Boolean
    Dim titulo As Range, vazio As Paragraph, anterior As Paragraph
    Dim inicio As Range, fimAnterior As Range
    For passagem = 1 To mTitulos.Count
        removeu = False
        Repaginar doc
        For i = mTitulos.Count To 1 Step -1
            Set titulo = mTitulos(i)
            Set vazio = titulo.Paragraphs(1).Previous
            If Not vazio Is Nothing Then
                If ParagrafoVazioSeguro(vazio) Then
                    Set anterior = vazio.Previous
                    Do While Not anterior Is Nothing
                        If Not ParagrafoVazioSeguro(anterior) Then Exit Do
                        Set anterior = anterior.Previous
                    Loop
                    Set inicio = titulo.Duplicate
                    inicio.Collapse wdCollapseStart
                    If anterior Is Nothing Then
                        vazio.Range.Delete
                        removeu = True
                    Else
                        Set fimAnterior = anterior.Range.Duplicate
                        If InStr(fimAnterior.Text, Chr$(12)) > 0 Or InStr(fimAnterior.Text, Chr$(14)) > 0 Then
                            fimAnterior.Collapse wdCollapseStart
                        Else
                            If fimAnterior.End > fimAnterior.Start Then fimAnterior.MoveEnd wdCharacter, -1
                            fimAnterior.Collapse wdCollapseEnd
                        End If
                        If fimAnterior.Information(wdActiveEndPageNumber) <> inicio.Information(wdActiveEndPageNumber) Or _
                            ObterIndiceColunaVisual(fimAnterior) <> ObterIndiceColunaVisual(inicio) Then
                            vazio.Range.Delete
                            removeu = True
                        End If
                    End If
                End If
            End If
        Next i
        If Not removeu Then Exit For
    Next passagem
    Repaginar doc
End Sub

Private Function QuestaoExcepcional(ByVal numero As Long) As Boolean
    Dim valor As Variant
    On Error Resume Next
    valor = mExcecoes(CStr(numero))
    QuestaoExcepcional = (Err.Number = 0)
    On Error GoTo 0
End Function

Private Function TituloLigadoAoConteudo(ByVal r As Range) As Boolean
    Dim p As Paragraph, ri As Range, rc As Range
    Set ri = r.Paragraphs(1).Range.Duplicate
    ri.Collapse wdCollapseStart
    For Each p In r.Paragraphs
        If p.Range.Start > r.Start And Not ParagrafoVazioSeguro(p) Then
            Set rc = p.Range.Duplicate
            rc.Collapse wdCollapseStart
            TituloLigadoAoConteudo = ri.Information(wdActiveEndPageNumber) = rc.Information(wdActiveEndPageNumber) And _
                ObterIndiceColunaVisual(ri) = ObterIndiceColunaVisual(rc)
            Exit Function
        End If
    Next p
End Function

Private Function ValidarLayoutFinal(ByVal doc As Document, ByVal rngInicioArea As Range, _
    ByVal rngFimArea As Range) As Boolean
    Dim i As Long, r As Range, p As Paragraph, visual As Range, a As Variant
    Set visual = RangeVisual(doc, rngInicioArea, rngFimArea)
    For Each p In visual.Paragraphs
        ' O Word expoe marcas de celula/linha como paragrafos virtuais.
        ' Elas nao possuem formatacao de paragrafo independente.
        If p.Range.End - p.Range.Start = 1 And p.Range.Text = vbCr & Chr$(7) Then GoTo ProximoParagrafoAuditoria
        With p.Format
            If .SpaceBefore <> 0 Or .SpaceAfter <> 0 Or .SpaceBeforeAuto <> False Or _
                .SpaceAfterAuto <> False Or .LineSpacingRule <> wdLineSpaceSingle Then
                RegistrarFalhaFluxo p, "Espacamento herdado nao normalizado"
                Exit Function
            End If
        End With
ProximoParagrafoAuditoria:
    Next p
    For i = 1 To mTitulos.Count
        Set r = RangeQuestaoAtual(doc, i)
        If Not TituloLigadoAoConteudo(r) Then
            mDetalheAuditoria = "Questao " & i & ": titulo separado do primeiro conteudo ou questao vazia."
            Exit Function
        End If
        If QuestaoEstaFragmentada(r) And Not QuestaoExcepcional(i) Then
            mDetalheAuditoria = "Questao " & i & ": bloco fragmentado apesar de caber em uma coluna."
            Exit Function
        End If
    Next i
    For Each a In mAreas
        Set p = CabecalhoDaQuestao(doc, CLng(a(0)), CStr(a(2)))
        If p Is Nothing Then
            mDetalheAuditoria = "Cabecalho ausente: " & CStr(a(2))
            Exit Function
        End If
        If ObterIndiceColunaVisual(p.Range) <> 1 Then
            RegistrarFalhaFluxo p, "Cabecalho fora da primeira coluna"
            Exit Function
        End If
    Next a
    ValidarLayoutFinal = True
End Function

Private Sub AtualizarContagemDaCapa(ByVal doc As Document, ByVal quantidade As Long)
    Dim p As Paragraph, rx As Object, mt As Object, r As Range, a As Variant, t As String
    Dim limite As Long, novo As String, i As Long
    limite = mTitulos(1).Start
    Set rx = CreateObject("VBScript.RegExp")
    rx.IgnoreCase = True
    AtualizarLinhasDeAreasNaCapa doc
    ' Modifica apenas trechos numericos de instrucoes reconhecidas, mantendo o resto.
    For i = doc.Paragraphs.Count To 1 Step -1
        Set p = doc.Paragraphs(i)
        If p.Range.Start < limite And Not p.Range.Information(wdWithInTable) Then
            t = p.Range.Text
            rx.Pattern = "cont.m\s+(\d{1,4})\s+quest.es"
            If rx.Test(t) Then
                Set mt = rx.Execute(t)(0)
                rx.Pattern = "\d+"
                Dim dig As Object
                Set dig = rx.Execute(mt.Value)(0)
                Set r = doc.Range(p.Range.Start + mt.FirstIndex + dig.FirstIndex, _
                    p.Range.Start + mt.FirstIndex + dig.FirstIndex + dig.Length)
                r.Text = CStr(quantidade)
                t = p.Range.Text
            End If
            rx.Pattern = "numeradas\s+de\s+01\s+a\s+(\d{1,4})"
            If rx.Test(t) Then
                Set mt = rx.Execute(t)(0)
                Set r = doc.Range(p.Range.Start + mt.FirstIndex + mt.Length - Len(mt.SubMatches(0)), _
                    p.Range.Start + mt.FirstIndex + mt.Length)
                r.Text = Format$(quantidade, "00")
                t = p.Range.Text
            End If
            rx.Pattern = "Quest.es de n.mero\s+(\d{1,4})\s+a\s+(\d{1,4})"
            If rx.Test(t) Then
                Set mt = rx.Execute(t)(0)
                For Each a In mAreas
                    If CLng(mt.SubMatches(0)) = CLng(a(0)) Then
                        Set r = doc.Range(p.Range.Start + mt.FirstIndex + mt.Length - Len(mt.SubMatches(1)), _
                            p.Range.Start + mt.FirstIndex + mt.Length)
                        r.Text = Format$(CLng(a(1)), "00")
                        Exit For
                    End If
                Next a
            End If
        End If
    Next i
End Sub

Private Sub AtualizarLinhasDeAreasNaCapa(ByVal doc As Document)
    Dim p As Paragraph, rx As Object, r As Range, nome As String, original As String
    Dim i As Long, total As Long, pos As Long, a As Variant, novo As String, mt As Object
    Set rx = CreateObject("VBScript.RegExp")
    rx.IgnoreCase = True
    rx.Pattern = "Quest.es de n.mero\s+\d{1,4}\s+a\s+\d{1,4}.*?rea de\s+(.+?)(?:;|\.|$)"
    For i = 1 To 99
        nome = "GSS_CAPA_AREA_" & Format$(i, "00")
        If Not doc.Bookmarks.Exists(nome) Then Exit For
        total = i
    Next i
    If total = 0 Then
        For Each p In doc.Paragraphs
            If p.Range.Start >= mTitulos(1).Start Then Exit For
            If rx.Test(LimparTexto(p.Range.Text)) Then
                total = total + 1
                nome = "GSS_CAPA_AREA_" & Format$(total, "00")
                Set r = p.Range.Duplicate
                r.MoveEnd wdCharacter, -1
                doc.Bookmarks.Add nome, r
                GravarVariavel doc, nome & "_ORIGINAL", r.Text
            End If
        Next p
    End If
    If total = 0 Then Exit Sub
    For i = total To 1 Step -1
        nome = "GSS_CAPA_AREA_" & Format$(i, "00")
        Set r = doc.Bookmarks(nome).Range.Duplicate
        pos = r.Start
        If i <= mAreas.Count Then
            a = mAreas(i)
            novo = "Questões de número " & Format$(a(0), "00") & " a " & Format$(a(1), "00") & _
                ", relativas à área de " & CStr(a(2)) & ";"
        Else
            original = LerVariavel(doc, nome & "_ORIGINAL")
            novo = "Área sem questões neste caderno."
            If rx.Test(original) Then
                Set mt = rx.Execute(original)(0)
                novo = "Área de " & mt.SubMatches(0) & ": sem questões neste caderno."
            End If
        End If
        If r.Text <> novo Then r.Text = novo
        doc.Bookmarks.Add nome, doc.Range(pos, pos + Len(novo))
    Next i
    For i = total + 1 To mAreas.Count
        a = mAreas(i)
        novo = "Questões de número " & Format$(a(0), "00") & " a " & Format$(a(1), "00") & _
            ", relativas à área de " & CStr(a(2)) & ";"
        nome = "GSS_CAPA_AREA_" & Format$(i - 1, "00")
        pos = doc.Bookmarks(nome).Range.End
        doc.Range(pos, pos).InsertAfter vbCr & novo
        nome = "GSS_CAPA_AREA_" & Format$(i, "00")
        doc.Bookmarks.Add nome, doc.Range(pos + 1, pos + 1 + Len(novo))
        GravarVariavel doc, nome & "_ORIGINAL", novo
    Next i
End Sub

Public Function RELATORIO_ULTIMA_FORMATACAO() As String
    RELATORIO_ULTIMA_FORMATACAO = mUltimoRelatorio
End Function

Private Sub CarregarNomesAreasAnteriores(ByVal doc As Document)
    Dim cfg As String, item As Variant, partes As Variant
    Set mNomesAreasAnteriores = New Collection
    cfg = LerVariavel(doc, "GSS_AREAS_DETECTADAS")
    For Each item In Split(cfg, ";")
        partes = Split(CStr(item), "|")
        If UBound(partes) = 1 Then mNomesAreasAnteriores.Add CStr(partes(1))
    Next item
End Sub

Private Sub RemoverCabecalhosObsoletos(ByVal doc As Document)
    Dim i As Long, a As Variant, manter As Boolean, p As Paragraph, ps As Paragraph, pt As Paragraph, r As Range
    For i = mTitulos.Count To 1 Step -1
        manter = False
        For Each a In mAreas
            If CLng(a(0)) = i Then manter = True: Exit For
        Next a
        If Not manter Then
            Set p = mTitulos(i).Paragraphs(1)
            Set ps = ParagrafoAnteriorNaoVazio(p)
            If Not ps Is Nothing Then
                If Left$(TextoNormalizado(ps.Range.Text), 12) = "QUESTOES DE " Then
                    Set pt = ParagrafoAnteriorNaoVazio(ps)
                    If Not pt Is Nothing Then
                        If EhTituloPrincipalArea(LimparTexto(pt.Range.Text)) Then
                            Set r = ps.Range.Duplicate: r.MoveEnd wdCharacter, -1: r.Text = vbNullString
                            Set r = pt.Range.Duplicate: r.MoveEnd wdCharacter, -1: r.Text = vbNullString
                            ps.Format.PageBreakBefore = False
                            pt.Format.PageBreakBefore = False
                        End If
                    End If
                End If
            End If
        End If
    Next i
End Sub

Private Function ParagrafoAnteriorNaoVazio(ByVal p As Paragraph) As Paragraph
    Dim anterior As Paragraph, passos As Long
    Set anterior = p.Previous
    Do While Not anterior Is Nothing And passos < 4
        If Len(LimparTexto(anterior.Range.Text)) > 0 Then
            Set ParagrafoAnteriorNaoVazio = anterior
            Exit Function
        End If
        If Not ParagrafoVazioSeguro(anterior) Then Exit Function
        Set anterior = anterior.Previous
        passos = passos + 1
    Loop
End Function

Private Function ContarAncorasNoRange(ByVal doc As Document, ByVal r As Range) As Long
    Dim shp As Shape
    For Each shp In doc.Shapes
        If shp.Anchor.Start >= r.Start And shp.Anchor.Start < r.End Then ContarAncorasNoRange = ContarAncorasNoRange + 1
    Next shp
End Function

Private Function CabecalhoDaQuestao(ByVal doc As Document, ByVal numero As Long, ByVal titulo As String) As Paragraph
    Dim p As Paragraph, passos As Long
    Set p = EncontrarParagrafoQuestao(doc, numero)
    If p Is Nothing Then Exit Function
    Set p = p.Previous
    Do While Not p Is Nothing And passos < 4
        If TextoNormalizado(p.Range.Text) = TextoNormalizado(titulo) Then
            Set CabecalhoDaQuestao = p
            Exit Function
        End If
        If Not ParagrafoVazioSeguro(p) And Not EhCabecalhoDeArea(LimparTexto(p.Range.Text)) Then Exit Do
        Set p = p.Previous
        passos = passos + 1
    Loop
End Function

Private Sub RemoverVaziosDepoisDasQuestoes(ByVal doc As Document, ByVal fim As Range)
    Dim p As Paragraph, proximo As Paragraph, limite As Long, r As Range
    limite = LocalizarInicioConteudoPosterior(doc, fim.End)
    If limite = 0 Then limite = doc.Content.End - 1
    If limite <= fim.End Then Exit Sub
    Set r = doc.Range(fim.End, limite)
    Dim i As Long
    For i = r.Paragraphs.Count To 1 Step -1
        Set p = r.Paragraphs(i)
        If p.Range.Start >= fim.End And p.Range.Start < limite Then
            If ParagrafoVazioSeguro(p) Then
                ' O ultimo paragrafo do documento e obrigatorio para o Word.
                If p.Range.End < doc.Content.End Then p.Range.Delete
            ElseIf Len(LimparTexto(p.Range.Text)) = 0 And InStr(p.Range.Text, Chr$(12)) > 0 Then
                If p.Range.InlineShapes.Count = 0 And p.Range.OMaths.Count = 0 And p.Range.Tables.Count = 0 Then
                    If ContarAncorasNoRange(doc, p.Range) = 0 Then
                        ' Preserva a quebra de secao; reduz apenas sua linha invisivel.
                        p.Range.Font.Size = 1
                        With p.Format
                            .SpaceBefore = 0
                            .SpaceAfter = 0
                            .SpaceBeforeAuto = False
                            .SpaceAfterAuto = False
                            .KeepWithNext = False
                            .KeepTogether = False
                            .PageBreakBefore = False
                            .LineSpacingRule = wdLineSpaceExactly
                            .LineSpacing = 1
                        End With
                    End If
                End If
            End If
        End If
    Next i
End Sub


' Linhas reais para separar titulo, imagens, enunciado, alternativas e questoes.
' As posicoes sao coletadas antes de inserir e aplicadas de tras para frente.
' Assim a segunda execucao nao duplica linhas nem altera os vinculos das imagens.
Private Sub AplicarLinhasEmBranco(ByVal doc As Document)
    Dim gaps As Object, r As Range, p As Paragraph, seguinte As Paragraph
    Dim anterior As Paragraph, i As Long, j As Long, k As Long, pos As Long
    Dim valores As Variant, troca As Variant, encontrouAlternativa As Boolean
    Set gaps = CreateObject("Scripting.Dictionary")
    For i = 1 To mTitulos.Count
        Set r = RangeQuestaoAtual(doc, i)
        Set p = r.Paragraphs(1)
        Set seguinte = p.Next
        If Not seguinte Is Nothing Then
            If seguinte.Range.Start < r.End Then MarcarLinhaAntes gaps, seguinte
        End If
        MarcarLinhaAntes gaps, p
        encontrouAlternativa = False
        For Each p In r.Paragraphs
            If p.Range.Start > r.Start Then
                If ParagrafoSoImagem(p) Then
                    Set anterior = p.Previous
                    If Not anterior Is Nothing Then
                        If Not ParagrafoSoImagem(anterior) Then MarcarLinhaAntes gaps, p
                    End If
                    Set seguinte = p.Next
                    If Not seguinte Is Nothing Then
                        If seguinte.Range.Start < r.End Then
                            If Not ParagrafoSoImagem(seguinte) Then MarcarLinhaAntes gaps, seguinte
                        End If
                    End If
                ElseIf Not encontrouAlternativa Then
                    If InicioAlternativas(p, r.End) Then
                        MarcarLinhaAntes gaps, p
                        encontrouAlternativa = True
                    End If
                End If
            End If
        Next p
    Next i
    If gaps.Count = 0 Then Exit Sub
    valores = gaps.Items
    For j = LBound(valores) To UBound(valores) - 1
        For k = j + 1 To UBound(valores)
            If CLng(valores(j)) < CLng(valores(k)) Then
                troca = valores(j): valores(j) = valores(k): valores(k) = troca
            End If
        Next k
    Next j
    For j = LBound(valores) To UBound(valores)
        pos = CLng(valores(j))
        doc.Range(pos, pos).InsertBefore vbCr
        Set r = doc.Range(pos, pos + 1)
        With r.Font
            .Name = "Arial": .Size = 9.5: .Bold = False: .AllCaps = False
        End With
        With r.ParagraphFormat
            .SpaceBefore = 0: .SpaceAfter = 0
            .SpaceBeforeAuto = False: .SpaceAfterAuto = False
            .LineSpacingRule = wdLineSpaceSingle
            .PageBreakBefore = False
            .KeepWithNext = False: .KeepTogether = False
        End With
    Next j
End Sub

Private Sub MarcarLinhaAntes(ByVal gaps As Object, ByVal p As Paragraph)
    Dim anterior As Paragraph
    ' Nao insere paragrafos nas celulas nem substitui quebras explicitas do autor.
    If p.Range.Information(wdWithInTable) Then Exit Sub
    If ParagrafoVazioSeguro(p) Then Exit Sub
    If InStr(p.Range.Text, Chr$(12)) > 0 Or InStr(p.Range.Text, Chr$(14)) > 0 Then Exit Sub
    Set anterior = p.Previous
    If anterior Is Nothing Then Exit Sub
    If ParagrafoVazioSeguro(anterior) Then Exit Sub
    gaps(CStr(p.Range.Start)) = p.Range.Start
End Sub

Private Function ParagrafoSoImagem(ByVal p As Paragraph) As Boolean
    If p Is Nothing Then Exit Function
    If p.Range.InlineShapes.Count = 0 Then Exit Function
    If p.Range.OMaths.Count > 0 Then Exit Function
    ParagrafoSoImagem = (Len(TextoSignificativo(TextoDoParagrafoSemImagens(p))) = 0)
End Function

Private Function InicioAlternativas(ByVal p As Paragraph, ByVal limiteFim As Long) As Boolean
    Dim texto As String, proximo As Paragraph, letra As String
    texto = LimparTexto(TextoDoParagrafoSemImagens(p))
    If LetraAlternativa(texto) <> "A" Then Exit Function
    ' A), A., A: ou A- sao marcadores explicitos, inclusive de resposta unica.
    If Len(texto) > 1 Then
        If InStr(").:-", Mid$(texto, 2, 1)) > 0 Then
            InicioAlternativas = True
            Exit Function
        End If
    End If
    Set proximo = p.Next
    Do While Not proximo Is Nothing
        If proximo.Range.Start >= limiteFim Then Exit Do
        texto = LimparTexto(TextoDoParagrafoSemImagens(proximo))
        If Len(texto) > 0 Then
            letra = LetraAlternativa(texto)
            InicioAlternativas = (Len(letra) = 1 And letra > "A")
            Exit Function
        End If
        Set proximo = proximo.Next
    Loop
End Function

Private Function AssinaturaEstruturaModelo(ByVal doc As Document) As String
    Dim s As Section, h As HeaderFooter, shp As Shape, c As TextColumn, v As String
    For Each s In doc.Sections
        With s.PageSetup
            v = v & "S:" & .PageWidth & ":" & .PageHeight & ":" & .TopMargin & ":" & .BottomMargin & ":" & .LeftMargin & ":" & .RightMargin & ":" & .Gutter & ":" & .Orientation & ":" & .SectionStart
            For Each c In .TextColumns
                v = v & "C:" & c.Width
            Next c
        End With
        For Each h In s.Headers
            v = v & "H:" & h.Exists & ":" & h.LinkToPrevious & ":" & TextoEstaticoComCampos(h.Range) & ":" & h.Shapes.Count & ":" & h.Range.InlineShapes.Count
        Next h
        For Each h In s.Footers
            v = v & "F:" & h.Exists & ":" & h.LinkToPrevious & ":" & TextoEstaticoComCampos(h.Range) & ":" & h.Shapes.Count & ":" & h.Range.InlineShapes.Count
        Next h
    Next s
    For Each shp In doc.Shapes
        If EhShapeProtegido(shp) Then v = v & "P:" & shp.Name & ":" & shp.Type & ":" & shp.Width & ":" & shp.Height & ":" & shp.Left & ":" & shp.Top
    Next shp
    AssinaturaEstruturaModelo = v
End Function

Private Function TextoEstaticoComCampos(ByVal r As Range) As String
    Dim t As String, f As Field, i As Long, pos As Long, tamanho As Long
    t = r.Text
    For i = r.Fields.Count To 1 Step -1
        Set f = r.Fields(i)
        pos = f.Result.Start - r.Start + 1
        tamanho = f.Result.End - f.Result.Start
        If pos > 0 And pos <= Len(t) + 1 Then
            t = Left$(t, pos - 1) & "{CAMPO:" & f.Code.Text & "}" & Mid$(t, pos + tamanho)
        End If
    Next i
    TextoEstaticoComCampos = t
End Function


