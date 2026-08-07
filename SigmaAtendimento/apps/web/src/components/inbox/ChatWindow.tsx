import { FormEvent, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { Conversation, Message, OutgoingMessagePayload, QuotedMessage } from './types';
import { Button } from '../ui/Button';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { apiBlobRequest } from '../../lib/api';
import { ContactAvatar } from './ContactAvatar';
import { Icon } from '../ui/Icon';
import { displayMessageBody, messageSignatureLabel } from './messagePresentation';
import type { AuthUser } from '../../lib/auth';
import { contactDisplayName } from './contactDisplayName';

const TicketFromConvModal = lazy(() => import('./TicketFromConvModal').then((module) => ({ default: module.TicketFromConvModal })));
type ConversationClosureMode = 'WITH_RATING' | 'INACTIVITY' | 'SILENT';

interface ChatWindowProps {
    currentUser: AuthUser | null;
    conversation: Conversation | null;
    messages: Message[];
    isLoading: boolean;
    isSubmitting: boolean;
    isSyncingHistory: boolean;
    sendError: string | null;
    onTake: () => void;
    onSend: (payload: OutgoingMessagePayload) => Promise<boolean>;
    onEdit: (messageId: string, body: string) => Promise<boolean>;
    onReact: (messageId: string, emoji: string) => Promise<boolean>;
    onSyncHistory: () => Promise<void>;
    onTransfer: (target: { departmentId?: string; assignedUserId?: string }) => void;
    onCloseConversation: (payload: {
        result: string;
        summary: string;
        serviceTopicId: string;
        customerBusinessId?: string | null;
        otherTopicDescription?: string | null;
        notes?: string | null;
        fieldServiceRequired?: boolean;
        closureMode: ConversationClosureMode;
    }) => Promise<void>;
    onCreateTicket: (payload: {
        title: string;
        priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        description?: string | null;
        technicianId?: string | null;
        scheduledAt?: string | null;
        visitAddress?: string | null;
        notesInternal?: string | null;
        serviceType?: 'REMOTO' | 'PRESENCIAL' | 'HIBRIDO';
    }) => Promise<void>;
    onBack?: () => void;
    isClosingConversation: boolean;
    isCreatingTicket: boolean;
    createTicketError: string | null;
    departments: Array<{ id: string; name: string; active?: boolean }>;
    transferUsers: Array<{ id: string; name: string; active?: boolean }>;
    serviceTopics: Array<{ id: string; name: string; description?: string | null; active?: boolean }>;
    isLoadingServiceTopics: boolean;
    serviceTopicsError: string | null;
    onReloadServiceTopics: () => Promise<void>;
    technicians: Array<{ id: string; name: string; active?: boolean }>;
    hasMore: boolean;
    onLoadMore: () => void;
    isRealtimeConnected: boolean;
    isRefreshing: boolean;
    lastSyncedAt: Date | null;
}

const MAX_ATTACHMENT_SIZE = 12 * 1024 * 1024;
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
const ACCEPTED_ATTACHMENT_TYPES = 'image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip']);
const COMMON_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

type SelectedAttachment = {
    file: File;
    type: Exclude<Message['type'], 'TEXT'>;
    previewUrl: string | null;
};

function transferPayload(value: string): { departmentId?: string; assignedUserId?: string } | null {
    const [destinationType, destinationId] = value.split(':', 2);
    if (!destinationId) return null;
    if (destinationType === 'user') return { assignedUserId: destinationId };
    if (destinationType === 'department') return { departmentId: destinationId };
    return null;
}

function attachmentType(file: File): SelectedAttachment['type'] {
    if (file.type.startsWith('image/')) return 'IMAGE';
    if (file.type.startsWith('audio/')) return 'AUDIO';
    if (file.type.startsWith('video/')) return 'VIDEO';
    return 'DOCUMENT';
}

function isAcceptedAttachment(file: File) {
    if (file.type.startsWith('image/') || file.type.startsWith('audio/') || file.type.startsWith('video/')) return true;
    return DOCUMENT_EXTENSIONS.has(file.name.split('.').pop()?.toLowerCase() || '');
}

function clipboardImageFile(file: File) {
    if (file.name) return file;
    const extensionByType: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/bmp': 'bmp',
    };
    const extension = extensionByType[file.type] || 'png';
    return new File([file], `imagem-colada-${Date.now()}.${extension}`, {
        type: file.type || 'image/png',
        lastModified: Date.now(),
    });
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
        reader.readAsDataURL(file);
    });
}

function formatFileSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRecordingDuration(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function replyPreview(message: Message | QuotedMessage) {
    if (message.deletedAt) return message.deletedByCustomer ? 'Mensagem excluída pelo cliente' : 'Mensagem excluída';
    const displayBody = displayMessageBody(message).trim();
    if (displayBody) return displayBody;
    if (message.type === 'IMAGE') return 'Imagem';
    if (message.type === 'AUDIO') return 'Áudio';
    if (message.type === 'VIDEO') return 'Vídeo';
    if (message.type === 'DOCUMENT') return 'Documento';
    return 'Mensagem';
}

function MediaAttachment({ conversationId, message }: { conversationId: string; message: Message }) {
    const [sourceUrl, setSourceUrl] = useState(message.mediaUrl || '');
    const [error, setError] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    const [directFailed, setDirectFailed] = useState(false);
    const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
    const imagePreviewRef = useDialogFocus<HTMLDivElement>(imagePreviewOpen, () => setImagePreviewOpen(false));
    const displayBody = displayMessageBody(message);

    useEffect(() => {
        if (message.mediaUrl && !directFailed) {
            setSourceUrl(message.mediaUrl);
            return;
        }
        if (!message.waMessageId) return;

        let active = true;
        let objectUrl = '';
        setSourceUrl('');
        setError(null);

        apiBlobRequest(`/api/conversations/${conversationId}/messages/${message.id}/media`)
            .then((blob) => {
                objectUrl = URL.createObjectURL(blob);
                if (active) setSourceUrl(objectUrl);
            })
            .catch((cause: unknown) => {
                if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a mídia.');
            });

        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [conversationId, directFailed, message.id, message.mediaUrl, message.waMessageId, retry]);

    if (sourceUrl) {
        if (message.type === 'IMAGE') {
            return (
                <>
                    <button
                        type="button"
                        onClick={() => setImagePreviewOpen(true)}
                        className="mb-1 block max-w-full overflow-hidden rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        aria-label={`Ampliar ${displayBody || 'imagem recebida'}`}
                    >
                        <img
                            src={sourceUrl}
                            alt={displayBody || 'Imagem recebida'}
                            className="max-h-80 max-w-full cursor-zoom-in object-cover"
                            loading="lazy"
                            onError={() => setDirectFailed(true)}
                        />
                    </button>

                    {imagePreviewOpen && createPortal(
                        <div
                            ref={imagePreviewRef}
                            tabIndex={-1}
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 pt-20 outline-none"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Visualização da imagem"
                            onMouseDown={(event) => {
                                if (event.target === event.currentTarget) setImagePreviewOpen(false);
                            }}
                        >
                            <div className="absolute inset-x-0 top-0 flex h-16 items-center justify-end px-4">
                                <button
                                    type="button"
                                    onClick={() => setImagePreviewOpen(false)}
                                    className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                                    aria-label="Fechar imagem"
                                    title="Fechar (Esc)"
                                >
                                    <Icon name="close" className="size-5" strokeWidth={2} />
                                </button>
                            </div>
                            <img
                                src={sourceUrl}
                                alt={displayBody || 'Imagem recebida'}
                                className="max-h-[calc(100vh-6rem)] max-w-[calc(100vw-2rem)] object-contain"
                            />
                        </div>,
                        document.body,
                    )}
                </>
            );
        }
        if (message.type === 'AUDIO') {
            return (
                <div className="mb-1 w-full min-w-0">
                    <audio
                        controls
                        preload="metadata"
                        src={sourceUrl}
                        onError={() => setDirectFailed(true)}
                        className="block h-12 w-full min-w-0"
                        aria-label="Áudio recebido"
                    />
                </div>
            );
        }
        if (message.type === 'VIDEO') {
            return <video controls preload="metadata" src={sourceUrl} onError={() => setDirectFailed(true)} className="mb-1 max-h-80 max-w-full rounded-lg" aria-label="Vídeo recebido" />;
        }
        return (
            <a href={sourceUrl} target="_blank" rel="noreferrer" download className="mb-1 flex items-center gap-2 text-xs font-medium underline underline-offset-2">
                <span aria-hidden="true">📎</span>
                <span>{displayBody || 'Baixar documento'}</span>
            </a>
        );
    }
    if (error) {
        return (
            <button
                type="button"
                onClick={() => { setDirectFailed(true); setRetry((value) => value + 1); }}
                className="mb-1 rounded-md px-1 py-0.5 text-left text-xs text-danger-fg underline decoration-danger/50 underline-offset-2 hover:decoration-current"
                title={error}
            >
                Não foi possível carregar a mídia. Tentar novamente
            </button>
        );
    }
    return <span className="mb-1 block text-xs text-muted-foreground">Carregando mídia…</span>;
}

/** Formata apenas a hora (ex: 14:30) — exibida dentro de cada bolha */
function formatTime(value?: string | Date | null): string {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Rótulo legível para o separador de data */
function dateSeparatorLabel(value: string | Date): string {
    const d = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Hoje';
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Agrupa mensagens por dia para exibir separadores de data */
function groupByDate(messages: Message[]) {
    const groups: { dateKey: string; label: string; items: Message[] }[] = [];
    for (const msg of messages) {
        const dateKey = new Date(msg.createdAt).toDateString();
        const last = groups.at(-1);
        if (last?.dateKey === dateKey) {
            last.items.push(msg);
        } else {
            groups.push({ dateKey, label: dateSeparatorLabel(msg.createdAt), items: [msg] });
        }
    }
    return groups;
}

function syncLabel(lastSyncedAt: Date | null): string {
    if (!lastSyncedAt) return 'Aguardando sincronizacao';

    const seconds = Math.max(0, Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000));
    if (seconds < 5) return 'Atualizado agora';
    if (seconds < 60) return `Atualizado ha ${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    return `Atualizado ha ${minutes}min`;
}

export function ChatWindow({
    currentUser,
    conversation,
    messages,
    isLoading,
    isSubmitting,
    isSyncingHistory,
    sendError,
    onTake,
    onSend,
    onEdit,
    onReact,
    onSyncHistory,
    onTransfer,
    onCloseConversation,
    onCreateTicket,
    onBack,
    isClosingConversation,
    isCreatingTicket,
    createTicketError,
    departments,
    transferUsers,
    serviceTopics,
    isLoadingServiceTopics,
    serviceTopicsError,
    onReloadServiceTopics,
    technicians,
    hasMore,
    onLoadMore,
    isRealtimeConnected,
    isRefreshing,
    lastSyncedAt,
}: ChatWindowProps) {
    const navigate = useNavigate();
    const [body, setBody] = useState('');
    const [attachment, setAttachment] = useState<SelectedAttachment | null>(null);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [editingMessage, setEditingMessage] = useState<Message | null>(null);
    const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
    const [messageActionMenuId, setMessageActionMenuId] = useState<string | null>(null);
    const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
    const [showScrollToBottom, setShowScrollToBottom] = useState(false);
    const [transferTarget, setTransferTarget] = useState('');
    const [ticketModalOpen, setTicketModalOpen] = useState(false);
    const [closeModalOpen, setCloseModalOpen] = useState(false);
    const closeDialogRef = useDialogFocus<HTMLDivElement>(closeModalOpen, () => {
        setCloseModalOpen(false);
        resetCloseForm();
    });
    const [closeForm, setCloseForm] = useState({
        closureMode: '' as ConversationClosureMode | '',
        result: '',
        summary: '',
        serviceTopicId: '',
        customerBusinessId: '',
        otherTopicDescription: '',
        notes: '',
        fieldServiceRequired: false,
    });
    const [closeError, setCloseError] = useState<string | null>(null);

    const containerRef    = useRef<HTMLDivElement>(null);
    const bottomRef       = useRef<HTMLDivElement>(null);
    const textareaRef     = useRef<HTMLTextAreaElement>(null);
    const fileInputRef    = useRef<HTMLInputElement>(null);
    const audioInputRef   = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingStreamRef = useRef<MediaStream | null>(null);
    const recordingCancelledRef = useRef(false);
    const recordingTimerRef = useRef<number | null>(null);
    const prevConvIdRef   = useRef<string | null>(null);
    const prevMsgCountRef = useRef(0);
    const replyHighlightTimerRef = useRef<number | null>(null);
    const isManager = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERVISOR';
    const isAssignedToCurrentUser = Boolean(currentUser?.id && conversation?.assignedUser?.id === currentUser.id);
    const canReply = Boolean(conversation && conversation.status !== 'CLOSED' && (isManager || isAssignedToCurrentUser));
    const isReplyingAsManager = Boolean(isManager && conversation && !isAssignedToCurrentUser && conversation.status !== 'CLOSED');
    const configuredSignature = currentUser?.messageSignature?.trim();
    const signatureArea = configuredSignature || currentUser?.department?.name?.trim();
    const currentSignature = configuredSignature?.includes('|')
        ? configuredSignature
        : [currentUser?.name?.trim(), signatureArea].filter(Boolean).join(' | ');
    const supportsDirectRecording = Boolean(
        window.isSecureContext
        && typeof navigator.mediaDevices?.getUserMedia === 'function'
        && typeof MediaRecorder !== 'undefined'
    );

    /* Scroll instantâneo ao trocar de conversa */
    useEffect(() => {
        if (isLoading) return;
        if (conversation?.id !== prevConvIdRef.current) {
            prevConvIdRef.current = conversation?.id ?? null;
            setShowScrollToBottom(false);
            requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }));
        }
    }, [conversation?.id, isLoading]);

    /* Scroll suave em novas mensagens recebidas via socket */
    useEffect(() => {
        const grew = messages.length > prevMsgCountRef.current;
        prevMsgCountRef.current = messages.length;
        if (!grew || isLoading) return;
        const c = containerRef.current;
        if (!c) return;
        const distanceFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
        if (distanceFromBottom < 200) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
            setShowScrollToBottom(true);
        }
    }, [messages]);

    const handleMessagesScroll = () => {
        const container = containerRef.current;
        if (!container) return;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        setShowScrollToBottom(distanceFromBottom > 200);
    };

    const scrollToBottom = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    };

    /* Auto-resize do textarea */
    const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setBody(e.target.value);
        const ta = e.target;
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 144)}px`;
    };

    const clearAttachment = () => {
        setAttachment((current) => {
            if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
            return null;
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    useEffect(() => () => {
        if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    }, [attachment?.previewUrl]);

    useEffect(() => {
        recordingCancelledRef.current = true;
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
        if (recordingTimerRef.current !== null) {
            window.clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        clearAttachment();
        setAttachmentError(null);
        setReplyingTo(null);
        setEditingMessage(null);
        setBody('');
        setHighlightedMessageId(null);
        setMessageActionMenuId(null);
        setReactionPickerMessageId(null);
    }, [conversation?.id]);

    useEffect(() => {
        if (!messageActionMenuId && !reactionPickerMessageId) return;
        const closeActions = (event: PointerEvent) => {
            const target = event.target as Element | null;
            if (!target?.closest('[data-message-actions]')) {
                setMessageActionMenuId(null);
                setReactionPickerMessageId(null);
            }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMessageActionMenuId(null);
                setReactionPickerMessageId(null);
            }
        };
        document.addEventListener('pointerdown', closeActions);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeActions);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [messageActionMenuId, reactionPickerMessageId]);

    useEffect(() => () => {
        if (replyHighlightTimerRef.current !== null) {
            window.clearTimeout(replyHighlightTimerRef.current);
        }
    }, []);

    useEffect(() => () => {
        recordingCancelledRef.current = true;
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
    }, []);

    const selectAttachment = (file: File, input?: HTMLInputElement | null) => {
        setAttachmentError(null);
        if (!isAcceptedAttachment(file)) {
            if (input) input.value = '';
            setAttachmentError('Formato não suportado. Envie imagem, áudio, vídeo, PDF, Office, texto, CSV ou ZIP.');
            return false;
        }
        if (file.size > MAX_ATTACHMENT_SIZE) {
            if (input) input.value = '';
            setAttachmentError('O arquivo excede o limite de 12 MB. Escolha um arquivo menor.');
            return false;
        }
        if (file.size === 0) {
            if (input) input.value = '';
            setAttachmentError('O arquivo selecionado está vazio.');
            return false;
        }
        clearAttachment();
        const type = attachmentType(file);
        setAttachment({
            file,
            type,
            previewUrl: type === 'IMAGE' || type === 'VIDEO' ? URL.createObjectURL(file) : null,
        });
        return true;
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        selectAttachment(file, event.target);
    };

    const openAudioFallback = () => {
        setAttachmentError(null);
        if (!audioInputRef.current) return;
        audioInputRef.current.value = '';
        audioInputRef.current.click();
    };

    const handleAudioFallbackChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        selectAttachment(file, event.target);
    };

    const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const pastedImage = Array.from(event.clipboardData.files).find(file => file.type.startsWith('image/'))
            || Array.from(event.clipboardData.items)
                .find(item => item.kind === 'file' && item.type.startsWith('image/'))
                ?.getAsFile();
        if (!pastedImage) return;

        event.preventDefault();
        if (editingMessage) {
            setAttachmentError('Conclua ou cancele a edição antes de colar uma imagem.');
            return;
        }
        if (isSubmitting) {
            setAttachmentError('Aguarde o envio atual terminar antes de colar outra imagem.');
            return;
        }

        selectAttachment(clipboardImageFile(pastedImage));
        requestAnimationFrame(() => textareaRef.current?.focus());
    };

    const finishRecording = () => {
        recordingCancelledRef.current = false;
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    };

    const cancelRecording = () => {
        recordingCancelledRef.current = true;
        if (recordingTimerRef.current !== null) {
            window.clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        } else {
            recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
            recordingStreamRef.current = null;
            mediaRecorderRef.current = null;
            setRecordingSeconds(0);
            setIsRecording(false);
        }
    };

    const startRecording = async () => {
        if (!supportsDirectRecording) {
            openAudioFallback();
            return;
        }
        setAttachmentError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            const chunks: Blob[] = [];
            clearAttachment();
            recordingCancelledRef.current = false;
            recordingStreamRef.current = stream;
            mediaRecorderRef.current = recorder;
            recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
            recorder.onstop = () => {
                stream.getTracks().forEach((track) => track.stop());
                if (recordingTimerRef.current !== null) {
                    window.clearInterval(recordingTimerRef.current);
                    recordingTimerRef.current = null;
                }
                recordingStreamRef.current = null;
                mediaRecorderRef.current = null;
                setIsRecording(false);
                setRecordingSeconds(0);
                if (recordingCancelledRef.current) {
                    recordingCancelledRef.current = false;
                    return;
                }
                const audioType = recorder.mimeType || 'audio/webm';
                const audioFile = new File([new Blob(chunks, { type: audioType })], `audio-${Date.now()}.webm`, { type: audioType });
                selectAttachment(audioFile);
            };
            recorder.start();
            setRecordingSeconds(0);
            recordingTimerRef.current = window.setInterval(() => {
                setRecordingSeconds((seconds) => seconds + 1);
            }, 1000);
            setIsRecording(true);
        } catch {
            setAttachmentError('Não foi possível acessar o microfone. Verifique a permissão do navegador.');
        }
    };

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (isRecording || !canReply) return;
        const text = body.trim();
        if (editingMessage) {
            if (!text) return;
            const edited = await onEdit(editingMessage.id, text);
            if (!edited) return;
            setBody('');
            setEditingMessage(null);
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
            return;
        }
        if (!text && !attachment) return;
        setAttachmentError(null);
        try {
            const payload: OutgoingMessagePayload = attachment
                ? {
                    body: text || (attachment.type === 'DOCUMENT' ? attachment.file.name : undefined),
                    type: attachment.type,
                    mediaUrl: await fileToDataUrl(attachment.file),
                    fileName: attachment.file.name,
                    replyToMessageId: replyingTo?.id,
                }
                : { body: text, type: 'TEXT', replyToMessageId: replyingTo?.id };
            const sent = await onSend(payload);
            if (!sent) return;
            setBody('');
            clearAttachment();
            setReplyingTo(null);
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
        } catch (error) {
            setAttachmentError(error instanceof Error ? error.message : 'Não foi possível preparar o arquivo para envio.');
        }
    };

    const beginEditing = (message: Message) => {
        clearAttachment();
        setReplyingTo(null);
        setEditingMessage(message);
        setBody(displayMessageBody(message));
        setMessageActionMenuId(null);
        setReactionPickerMessageId(null);
        requestAnimationFrame(() => {
            const textarea = textareaRef.current;
            if (!textarea) return;
            textarea.focus();
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        });
    };

    const focusQuotedMessage = (messageId: string) => {
        const element = document.getElementById(`message-${messageId}`);
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedMessageId(messageId);
        if (replyHighlightTimerRef.current !== null) {
            window.clearTimeout(replyHighlightTimerRef.current);
        }
        replyHighlightTimerRef.current = window.setTimeout(() => {
            setHighlightedMessageId(null);
            replyHighlightTimerRef.current = null;
        }, 1600);
    };

    /* Enter envia; Shift+Enter quebra linha */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Escape' && (replyingTo || editingMessage)) {
            e.preventDefault();
            setReplyingTo(null);
            if (editingMessage) {
                setEditingMessage(null);
                setBody('');
                if (textareaRef.current) textareaRef.current.style.height = 'auto';
            }
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit(e as unknown as FormEvent);
        }
    };

    /* ── Tela sem conversa selecionada ── */
    if (!conversation) {
        return (
            <section className="hidden flex-1 items-center justify-center bg-surface-alt md:flex">
                <EmptyState
                    icon="forum"
                    title="Selecione uma conversa"
                    description="Escolha um atendimento na lista para visualizar as mensagens e responder o cliente."
                />
            </section>
        );
    }

    const contactName = contactDisplayName(conversation.contact);

    const canAct = canReply;
    const activeTransferUsers = transferUsers.filter((transferUser) => transferUser.active ?? true);
    const activeDepartments = departments.filter((department) => department.active ?? true);
    const canTransfer = activeTransferUsers.length > 0 || activeDepartments.length > 0;

    const submitTransfer = (value: string) => {
        const payload = transferPayload(value);
        if (!payload) return;
        onTransfer(payload);
        setTransferTarget('');
    };

    const resetCloseForm = () => {
        setCloseForm({
            closureMode: '',
            result: '',
            summary: '',
            serviceTopicId: '',
            customerBusinessId: '',
            otherTopicDescription: '',
            notes: '',
            fieldServiceRequired: false,
        });
        setCloseError(null);
    };

    const selectedTopic = serviceTopics.find((topic) => topic.id === closeForm.serviceTopicId);
    const activeServiceTopics = serviceTopics.filter((topic) => topic.active ?? true);
    const requiresOtherDescription = selectedTopic?.name.trim().toLowerCase() === 'outro';
    const customerBusinesses = conversation.contact.customer?.businesses ?? [];

    const openCloseModal = () => {
        setCloseForm((current) => ({
            ...current,
            customerBusinessId: conversation.contact.businessId
                || (customerBusinesses.length === 1 ? customerBusinesses[0].id : '')
                || current.customerBusinessId,
        }));
        setCloseModalOpen(true);
        void onReloadServiceTopics();
    };

    const submitCloseConversation = async (event: FormEvent) => {
        event.preventDefault();
        setCloseError(null);

        if (!closeForm.closureMode || !closeForm.result.trim() || !closeForm.summary.trim() || !closeForm.serviceTopicId) {
            setCloseError('Escolha como encerrar e informe resultado, resumo e sistema/assunto.');
            return;
        }

        if (customerBusinesses.length > 0 && !closeForm.customerBusinessId) {
            setCloseError('Selecione a empresa atendida.');
            return;
        }

        if (requiresOtherDescription && !closeForm.otherTopicDescription.trim()) {
            setCloseError('Descreva o assunto quando selecionar Outro.');
            return;
        }

        await onCloseConversation({
            result: closeForm.result.trim(),
            summary: closeForm.summary.trim(),
            serviceTopicId: closeForm.serviceTopicId,
            customerBusinessId: closeForm.customerBusinessId || null,
            otherTopicDescription: closeForm.otherTopicDescription.trim() || null,
            notes: closeForm.notes.trim() || null,
            fieldServiceRequired: closeForm.fieldServiceRequired,
            closureMode: closeForm.closureMode,
        });
        setCloseModalOpen(false);
        resetCloseForm();
    };

    const handleCreateTicket = async (payload: {
        title: string;
        priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        description?: string | null;
        technicianId?: string | null;
        scheduledAt?: string | null;
        visitAddress?: string | null;
        notesInternal?: string | null;
        serviceType?: 'REMOTO' | 'PRESENCIAL' | 'HIBRIDO';
    }) => {
        await onCreateTicket(payload);
        setTicketModalOpen(false);
    };

    const groups = groupByDate(messages);

    const handleReaction = async (messageId: string, emoji: string) => {
        const reacted = await onReact(messageId, emoji);
        if (reacted) setReactionPickerMessageId(null);
    };

    return (
        <section className={`${conversation ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col bg-background`}>

            {/* ══ Header ══════════════════════════════════════════════ */}
            <header className="sigma-chat-header flex shrink-0 items-center gap-3 border-b border-border bg-surface py-2.5 pl-[68px] pr-3 md:px-4">
                <div className="sigma-chat-contact flex min-w-0 flex-1 items-center gap-3">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            aria-label="Voltar para a lista de conversas"
                            title="Voltar para conversas"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-surface-alt md:hidden"
                        >
                            <Icon name="arrow_back" className="size-5" />
                        </button>
                    )}

                    <ContactAvatar
                        contactId={conversation.contactId}
                        avatarUrl={conversation.contact?.avatarUrl}
                        name={contactName}
                        className="sigma-chat-contact-avatar h-10 w-10 shrink-0 rounded-full text-sm select-none"
                    />

                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-bold text-foreground">{contactName}</h2>
                        <div className="sigma-chat-contact-meta mt-0.5 flex flex-wrap items-center gap-2">
                            <p className="truncate text-xs text-muted-foreground">{conversation.contact?.phone}</p>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                <span
                                    className={[
                                        'h-1.5 w-1.5 rounded-full',
                                        isRealtimeConnected ? 'bg-success' : isRefreshing ? 'bg-warning animate-pulse' : 'bg-muted-foreground/50',
                                    ].join(' ')}
                                    aria-hidden="true"
                                />
                                {isRealtimeConnected ? 'Tempo real ativo' : isRefreshing ? 'Sincronizando' : syncLabel(lastSyncedAt)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Ações */}
                <div className="sigma-chat-actions flex shrink-0 items-center justify-end gap-2">
                    <div className="sigma-chat-action-group" role="group" aria-label="Ações da conversa">
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            loading={isSyncingHistory}
                            onClick={() => void onSyncHistory()}
                            aria-label="Importar histórico"
                            title="Importar histórico"
                            className="sigma-chat-action-button sigma-chat-action-button--secondary"
                        >
                            {!isSyncingHistory && <Icon name="history" className="size-5" />}
                            <span className="sigma-chat-action-label sigma-chat-action-label--secondary">Importar histórico</span>
                        </Button>
                        {canAct && (
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => navigate(`/tasks?new=1&conversationId=${conversation.id}&contactId=${conversation.contactId}${conversation.serviceTopicId ? `&serviceTopicId=${conversation.serviceTopicId}` : ''}`)}
                                aria-label="Criar tarefa"
                                title="Criar tarefa"
                                className="sigma-chat-action-button sigma-chat-action-button--primary"
                            >
                                <Icon name="task_list" className="size-5" />
                                <span className="sigma-chat-action-label sigma-chat-action-label--primary">Criar tarefa</span>
                            </Button>
                        )}
                        {canAct && (
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => setTicketModalOpen(true)}
                                aria-label="Criar chamado"
                                title="Criar chamado"
                                className="sigma-chat-action-button sigma-chat-action-button--primary"
                            >
                                <Icon name="add_ticket" className="size-5" />
                                <span className="sigma-chat-action-label sigma-chat-action-label--primary">Criar chamado</span>
                            </Button>
                        )}
                    </div>

                    {canAct && <span className="sigma-chat-action-divider" aria-hidden="true" />}

                    {canAct && (
                        <div className="sigma-chat-action-group" role="group" aria-label="Gerenciar atendimento">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                loading={isClosingConversation}
                                onClick={openCloseModal}
                                aria-label="Encerrar atendimento"
                                title="Encerrar atendimento"
                                className="sigma-chat-action-button sigma-chat-action-button--secondary"
                            >
                                {!isClosingConversation && <Icon name="call_end" className="size-5" />}
                                <span className="sigma-chat-action-label sigma-chat-action-label--secondary">Encerrar</span>
                            </Button>

                            {canTransfer && (
                                <label
                                    className="sigma-chat-transfer-compact relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground"
                                    title="Transferir atendimento"
                                >
                                    <Icon name="swap_horiz" className="size-5" />
                                    <select
                                        value=""
                                        onChange={(e) => submitTransfer(e.target.value)}
                                        aria-label="Transferir atendimento para usuário ou setor"
                                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    >
                                        <option value="">Transferir atendimento</option>
                                        {activeTransferUsers.length > 0 && (
                                            <optgroup label="Usuários">
                                                {activeTransferUsers.map((transferUser) => (
                                                    <option key={transferUser.id} value={`user:${transferUser.id}`}>{transferUser.name}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {activeDepartments.length > 0 && (
                                            <optgroup label="Setores">
                                                {activeDepartments.map((department) => (
                                                    <option key={department.id} value={`department:${department.id}`}>{department.name}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                </label>
                            )}

                            {canTransfer && (
                                <form
                                    onSubmit={(e) => { e.preventDefault(); submitTransfer(transferTarget); }}
                                    className="sigma-chat-transfer-wide items-center gap-2"
                                >
                                    <select
                                        value={transferTarget}
                                        onChange={(e) => setTransferTarget(e.target.value)}
                                        aria-label="Destino da transferência"
                                        className="sigma-chat-transfer-select min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                                    >
                                        <option value="">Transferir para...</option>
                                        {activeTransferUsers.length > 0 && (
                                            <optgroup label="Usuários">
                                                {activeTransferUsers.map((transferUser) => (
                                                    <option key={transferUser.id} value={`user:${transferUser.id}`}>{transferUser.name}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {activeDepartments.length > 0 && (
                                            <optgroup label="Setores">
                                                {activeDepartments.map((department) => (
                                                    <option key={department.id} value={`department:${department.id}`}>{department.name}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                    <Button
                                        type="submit"
                                        variant="outline"
                                        size="sm"
                                        disabled={!transferTarget}
                                        className="sigma-chat-transfer-submit"
                                    >
                                        Transferir
                                    </Button>
                                </form>
                            )}
                        </div>
                    )}

                    {conversation.status === 'OPEN' && (
                        <>
                            <span className="sigma-chat-action-divider" aria-hidden="true" />
                            <button
                                type="button"
                                onClick={onTake}
                                aria-label="Assumir esta conversa"
                                title="Assumir esta conversa"
                                className="sigma-chat-action-button sigma-chat-action-button--secondary inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-colors hover:brightness-95"
                                style={{ background: 'var(--c-chat-action)' }}
                            >
                                <Icon name="person_check" className="size-5" />
                                <span className="sigma-chat-action-label sigma-chat-action-label--secondary">Assumir conversa</span>
                            </button>
                        </>
                    )}
                </div>
            </header>

            {/* ══ Área de mensagens ═══════════════════════════════════ */}
            <div className="relative min-h-0 flex-1">
                <div
                    ref={containerRef}
                    onScroll={handleMessagesScroll}
                    className="sigma-chat-surface h-full overflow-y-auto scrollbar-thin px-3 py-4 md:px-6"
                >
                {/* Botão de carregar mais */}
                {hasMore && (
                    <div className="mb-4 flex justify-center">
                        <button
                            type="button"
                            onClick={onLoadMore}
                            disabled={isLoading}
                            aria-label="Carregar mensagens anteriores"
                            className="rounded-full border border-border bg-surface px-4 py-1 text-xs font-medium text-muted-foreground shadow-sm hover:bg-surface-alt transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isLoading ? 'Carregando...' : '↑ Carregar anteriores'}
                        </button>
                    </div>
                )}

                {/* Skeletons */}
                {isLoading && (
                    <div className="space-y-3" aria-label="Carregando mensagens">
                        {([false, true, false, true] as boolean[]).map((out, i) => (
                            <div key={i} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className="w-2/3 max-w-xs rounded-2xl p-3"
                                    style={{ background: out ? 'var(--c-chat-bubble-out)' : 'var(--c-chat-bubble-in)', border: '1px solid var(--c-border)' }}
                                >
                                    <Skeleton className="h-3 w-4/5" />
                                    <Skeleton className="mt-1.5 h-3 w-3/5" />
                                    <div className="mt-2 flex justify-end">
                                        <Skeleton className="h-2.5 w-8" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {!isLoading && messages.length === 0 && (
                    <div className="flex h-full items-center justify-center">
                        <div className="rounded-2xl border border-border bg-surface px-6 py-5 text-center shadow-sm">
                            <EmptyState
                                icon="forum"
                                title="Conversa sem mensagens"
                                description="As mensagens trocadas com este contato aparecerão aqui."
                            />
                        </div>
                    </div>
                )}

                {/* Grupos por data */}
                {!isLoading && groups.map((group) => (
                    <div key={group.dateKey}>

                        {/* Separador de data */}
                        <div className="my-4 flex items-center justify-center">
                            <span className="rounded-full border border-border bg-surface px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
                                {group.label}
                            </span>
                        </div>

                        <div className="space-y-1">
                            {group.items.map((msg, idx) => {
                                const outbound = msg.direction === 'OUTBOUND';
                                const system   = msg.direction === 'SYSTEM';
                                const isDeleted = Boolean(msg.deletedAt);
                                const displayBody = displayMessageBody(msg);
                                const signatureLabel = isDeleted ? null : messageSignatureLabel(msg);

                                /* Detecta sequência para suprimir a "cauda" nos intermediários */
                                const prevSameDir = group.items[idx - 1]?.direction === msg.direction;
                                const nextSameDir = group.items[idx + 1]?.direction === msg.direction;

                                /* ── Mensagem de sistema ── */
                                if (system) {
                                    return (
                                        <div key={msg.id} className="flex justify-center py-1">
                                            <span className="rounded-full bg-surface px-4 py-0.5 text-[11px] text-muted-foreground border border-border shadow-sm">
                                                {msg.body}
                                            </span>
                                        </div>
                                    );
                                }

                                /* ── Bolha de mensagem ── */
                                return (
                                    <div
                                        key={msg.id}
                                        id={`message-${msg.id}`}
                                        className={`group relative flex rounded-lg transition-shadow ${outbound ? 'justify-end' : 'justify-start'} ${prevSameDir ? 'mt-0.5' : 'mt-2'} ${highlightedMessageId === msg.id ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-surface-alt' : ''}`}
                                    >
                                        <div
                                            className={msg.type === 'AUDIO'
                                                ? 'relative w-full max-w-[22rem]'
                                                : 'relative max-w-[78%] md:max-w-[66%]'}
                                        >
                                        {canAct && !isDeleted && !msg.id.startsWith('local-') && (
                                            <div
                                                data-message-actions={msg.id}
                                                className={[
                                                    'absolute right-1 top-1 z-20 transition-opacity duration-150',
                                                    messageActionMenuId === msg.id || reactionPickerMessageId === msg.id
                                                        ? 'opacity-100'
                                                        : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100',
                                                ].join(' ')}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setMessageActionMenuId((current) => current === msg.id ? null : msg.id);
                                                        setReactionPickerMessageId(null);
                                                    }}
                                                    className="flex size-7 items-center justify-center rounded-md bg-surface/90 text-muted-foreground shadow-sm transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                                    aria-label="Abrir ações da mensagem"
                                                    aria-haspopup="menu"
                                                    aria-expanded={messageActionMenuId === msg.id}
                                                >
                                                    <Icon name="expand_more" className="size-4" strokeWidth={2} />
                                                </button>
                                                {messageActionMenuId === msg.id && (
                                                    <div
                                                        className={`absolute top-8 z-20 min-w-36 rounded-lg border border-border bg-surface p-1 shadow-sm ${outbound ? 'right-0' : 'left-0'}`}
                                                        role="menu"
                                                        aria-label="Ações da mensagem"
                                                    >
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setReplyingTo(msg);
                                                        setMessageActionMenuId(null);
                                                    }}
                                                    className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                                    aria-label="Responder esta mensagem"
                                                    role="menuitem"
                                                >
                                                    <Icon name="reply" className="size-4 text-muted-foreground" strokeWidth={2} />
                                                    <span>Responder</span>
                                                </button>
                                                {outbound && msg.type === 'TEXT' && Boolean(msg.waMessageId) && Date.now() - new Date(msg.createdAt).getTime() <= MESSAGE_EDIT_WINDOW_MS && (
                                                    <button
                                                        type="button"
                                                        onClick={() => beginEditing(msg)}
                                                        className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                                        aria-label="Editar esta mensagem"
                                                        role="menuitem"
                                                    >
                                                        <Icon name="edit" className="size-4 text-muted-foreground" strokeWidth={2} />
                                                        <span>Editar</span>
                                                    </button>
                                                )}
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={() => setReactionPickerMessageId((current) => current === msg.id ? null : msg.id)}
                                                        className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[0px] font-medium text-foreground transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                                        aria-label="Reagir a esta mensagem"
                                                        aria-expanded={reactionPickerMessageId === msg.id}
                                                        role="menuitem"
                                                    >
                                                        <Icon name="add_reaction" className="size-4 text-muted-foreground" strokeWidth={2} />
                                                        <span className="text-sm">Reagir</span>
                                                    </button>
                                                    {reactionPickerMessageId === msg.id && (
                                                        <div className={`absolute top-0 z-30 flex gap-1 rounded-lg border border-border bg-surface p-1.5 shadow-sm ${outbound ? 'right-full mr-2' : 'left-full ml-2'}`} role="group" aria-label="Escolher reação">
                                                            {COMMON_REACTIONS.map((emoji) => (
                                                                <button
                                                                    key={emoji}
                                                                    type="button"
                                                                    onClick={() => void handleReaction(msg.id, emoji)}
                                                                    className="flex size-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                                                    aria-label={`Reagir com ${emoji}`}
                                                                >
                                                                    {emoji}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                            </div>
                                        )}
                                        <div
                                            className={[
                                                'sigma-chat-bubble relative max-w-full min-w-[88px] px-3 pt-2 pb-5 text-sm text-foreground',
                                                canAct && !isDeleted && !msg.id.startsWith('local-') ? 'pr-9' : '',
                                                /* Geometria das bolhas — canto oposto à direção tem raio menor (efeito cauda) */
                                                outbound
                                                    ? nextSameDir
                                                        ? 'rounded-lg rounded-br-md'
                                                        : 'sigma-chat-bubble-out rounded-lg rounded-br-sm'
                                                    : nextSameDir
                                                        ? 'rounded-lg rounded-bl-md'
                                                        : 'sigma-chat-bubble-in rounded-lg rounded-bl-sm',
                                            ].join(' ')}
                                            style={{
                                                background: outbound
                                                    ? 'var(--c-chat-bubble-out)'
                                                    : 'var(--c-chat-bubble-in)',
                                            }}
                                        >
                                            {!isDeleted && msg.replyToMessage && (
                                                <button
                                                    type="button"
                                                    onClick={() => focusQuotedMessage(msg.replyToMessage!.id)}
                                                    className="mb-2 block w-full rounded-md border border-border/70 bg-surface-alt/80 px-2.5 py-2 text-left transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                                    aria-label="Ir para a mensagem respondida"
                                                >
                                                    <span className="block text-[11px] font-semibold text-primary">
                                                        {msg.replyToMessage.direction === 'OUTBOUND' ? 'Você' : contactName}
                                                    </span>
                                                    <span className="mt-0.5 block max-w-[280px] truncate text-xs text-muted-foreground">
                                                        {replyPreview(msg.replyToMessage)}
                                                    </span>
                                                </button>
                                            )}

                                            {/* Mídia */}
                                            {signatureLabel && (
                                                <p
                                                    className="mb-1 text-[11px] font-semibold leading-tight"
                                                    style={{ color: 'var(--c-chat-sig)' }}
                                                >
                                                    {signatureLabel}:
                                                </p>
                                            )}

                                            {!isDeleted && msg.type !== 'TEXT' && (
                                                <MediaAttachment conversationId={conversation.id} message={msg} />
                                            )}

                                            {/* Corpo da mensagem (texto / legenda) */}
                                            {isDeleted ? (
                                                <p className="flex items-center gap-2 pr-1 italic leading-snug text-muted-foreground">
                                                    <Icon name="block" className="size-4 shrink-0" strokeWidth={1.8} />
                                                    <span>{msg.deletedByCustomer ? 'Mensagem excluída pelo cliente' : 'Mensagem excluída'}</span>
                                                </p>
                                            ) : (displayBody || !msg.mediaUrl) && (
                                                <p className="whitespace-pre-wrap leading-snug text-foreground">
                                                    {displayBody}
                                                </p>
                                            )}

                                            {/* Horário — canto inferior direito, dentro da bolha */}
                                            <span
                                                className="absolute bottom-1 right-2.5 flex items-center gap-1 text-[10px] text-muted-foreground select-none"
                                                aria-label={`Enviado às ${formatTime(msg.createdAt)}`}
                                            >
                                                {msg.editedAt && !isDeleted && <span>editada</span>}
                                                <span>{formatTime(msg.createdAt)}</span>
                                                {outbound && (
                                                    <span
                                                        className={msg.id.startsWith('local-') ? 'text-muted-foreground' : 'text-[color:var(--c-chat-sig)]'}
                                                        aria-label={msg.id.startsWith('local-') ? 'Enviando' : 'Enviada'}
                                                        title={msg.id.startsWith('local-') ? 'Enviando' : 'Enviada'}
                                                    >
                                                        {msg.id.startsWith('local-') ? '•' : '✓✓'}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {/* Sentinel para scroll-to-bottom */}
                    <div ref={bottomRef} className="h-1" />
                </div>

                {showScrollToBottom && (
                    <button
                        type="button"
                        onClick={scrollToBottom}
                        aria-label="Ir para o final da conversa"
                        title="Ir para o final da conversa"
                        className="absolute bottom-3 right-3 z-10 inline-flex size-11 items-center justify-center rounded-full border border-border bg-elevated text-muted-foreground shadow-md transition-colors hover:border-primary/40 hover:text-primary md:bottom-4 md:right-5"
                    >
                        <Icon name="arrow_down" className="size-5" strokeWidth={2.25} />
                    </button>
                )}
            </div>

            {/* ══ Barra de envio ══════════════════════════════════════ */}
            <form
                onSubmit={submit}
                className="shrink-0 border-t border-border/70 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5"
                style={{ background: 'var(--c-chat-input-bg)' }}
            >
                {isReplyingAsManager && (
                    <div className="mb-2 rounded-lg bg-info-soft px-3 py-2 text-xs text-info-fg" role="status">
                        <span className="font-semibold">Respondendo como {currentSignature || currentUser?.name || 'gestor'}.</span>{' '}
                        O responsável permanece {conversation.assignedUser?.name || conversation.assignedUser?.nome || 'não definido'}.
                    </div>
                )}
                {!canReply && conversation.status !== 'CLOSED' && (
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-fg" role="status">
                        <span>Assuma esta conversa para responder ao cliente.</span>
                        <Button type="button" size="sm" onClick={onTake}>Assumir e responder</Button>
                    </div>
                )}
                {sendError && (
                    <div className="mb-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger-fg">
                        {sendError}
                    </div>
                )}
                {attachmentError && (
                    <div role="alert" className="mb-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger-fg">
                        {attachmentError}
                    </div>
                )}

                {attachment && (
                    <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
                        {attachment.type === 'IMAGE' && attachment.previewUrl ? (
                            <img src={attachment.previewUrl} alt="Prévia do anexo" className="size-12 shrink-0 rounded-lg object-cover" />
                        ) : attachment.type === 'VIDEO' && attachment.previewUrl ? (
                            <video src={attachment.previewUrl} aria-label="Prévia do vídeo" className="size-12 shrink-0 rounded-lg object-cover" />
                        ) : (
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-alt text-xs font-bold text-muted-foreground" aria-hidden="true">
                                {attachment.type === 'AUDIO' ? 'ÁUDIO' : 'ARQ'}
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{attachment.file.name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{formatFileSize(attachment.file.size)} · limite de 12 MB</p>
                        </div>
                        <button
                            type="button"
                            onClick={clearAttachment}
                            disabled={isSubmitting}
                            aria-label={`Remover anexo ${attachment.file.name}`}
                            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-alt hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
                        >
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}

                {editingMessage && (
                    <div className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
                            <Icon name="edit" className="size-4" strokeWidth={2} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground">Editando mensagem</p>
                            <p className="truncate text-xs text-muted-foreground">{replyPreview(editingMessage)}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setEditingMessage(null);
                                setBody('');
                                if (textareaRef.current) textareaRef.current.style.height = 'auto';
                            }}
                            disabled={isSubmitting}
                            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground disabled:opacity-50"
                            aria-label="Cancelar edição"
                            title="Cancelar edição"
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}

                {replyingTo && !editingMessage && (
                    <div className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
                        <div className="h-8 w-1 rounded-full bg-primary" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground">
                                Respondendo a {replyingTo.direction === 'OUTBOUND' ? 'você' : contactName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{replyPreview(replyingTo)}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setReplyingTo(null)}
                            disabled={isSubmitting}
                            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground disabled:opacity-50"
                            aria-label="Cancelar resposta"
                            title="Cancelar resposta"
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}

                <div className="flex items-end gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED_ATTACHMENT_TYPES}
                        onChange={handleFileChange}
                        disabled={isSubmitting || Boolean(editingMessage) || !canReply}
                        className="sr-only"
                        aria-label="Selecionar imagem, áudio, vídeo ou documento"
                    />
                    <input
                        ref={audioInputRef}
                        type="file"
                        accept="audio/*"
                        capture="user"
                        onChange={handleAudioFallbackChange}
                        disabled={isSubmitting || Boolean(editingMessage) || !canReply}
                        className="sr-only"
                        aria-label="Gravar ou selecionar áudio"
                    />
                    {isRecording ? (
                        <>
                            <button
                                type="button"
                                onClick={cancelRecording}
                                aria-label="Cancelar gravação de áudio"
                                title="Cancelar e descartar áudio"
                                className="flex size-11 shrink-0 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
                                </svg>
                            </button>
                            <div
                                className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-surface px-4 text-sm shadow-sm"
                                aria-label={`Gravando áudio há ${formatRecordingDuration(recordingSeconds)}`}
                            >
                                <span className="size-2 shrink-0 rounded-full bg-danger motion-safe:animate-pulse" aria-hidden="true" />
                                <span className="truncate font-medium text-foreground">Gravando áudio</span>
                                <span className="ml-auto tabular-nums text-muted-foreground" aria-hidden="true">
                                    {formatRecordingDuration(recordingSeconds)}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={finishRecording}
                                aria-label="Concluir gravação de áudio"
                                title="Concluir e revisar áudio"
                                className="flex size-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-all hover:brightness-95 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                style={{ background: 'var(--c-chat-action)' }}
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="m5 12 4 4L19 6" />
                                </svg>
                            </button>
                        </>
                    ) : (
                        <>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSubmitting || Boolean(editingMessage) || !canReply}
                        aria-label="Anexar arquivo"
                        title="Anexar arquivo (máximo 12 MB)"
                        className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onClick={startRecording}
                        disabled={isSubmitting || Boolean(editingMessage) || !canReply}
                        aria-label={supportsDirectRecording ? 'Gravar áudio' : 'Gravar ou selecionar áudio'}
                        title={supportsDirectRecording ? 'Gravar áudio' : 'Gravar ou selecionar áudio'}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <rect x="9" y="2" width="6" height="12" rx="3" />
                            <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
                        </svg>
                    </button>
                    <textarea
                        ref={textareaRef}
                        id="chat-message-input"
                        value={body}
                        onChange={handleBodyChange}
                        onPaste={handlePaste}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        disabled={!canReply}
                        aria-label={editingMessage ? 'Novo texto da mensagem' : 'Mensagem para o cliente'}
                        placeholder={
                            conversation.status === 'CLOSED'
                                ? 'Conversa encerrada'
                                : editingMessage
                                    ? 'Edite a mensagem...'
                                    : 'Digite uma mensagem ou cole uma imagem com Ctrl+V...'
                        }
                        className={[
                            'flex-1 resize-none rounded-2xl border border-transparent bg-surface',
                            'px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground shadow-sm',
                            'outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/20',
                            'disabled:cursor-not-allowed disabled:opacity-60',
                        ].join(' ')}
                        style={{ minHeight: 44, maxHeight: 144, lineHeight: 1.5 }}
                    />

                    <button
                        type="submit"
                        disabled={isSubmitting || (!body.trim() && !attachment) || !canReply}
                        aria-label={editingMessage ? 'Salvar edição' : 'Enviar mensagem'}
                        className={[
                            'flex h-11 w-11 shrink-0 items-center justify-center',
                            'rounded-full text-white shadow-sm',
                            'transition-all hover:brightness-95 active:scale-95',
                            'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
                        ].join(' ')}
                        style={{ background: 'var(--c-chat-action)' }}
                    >
                        {/* Ícone de enviar (send) — inline SVG, sem dependência externa */}
                        {editingMessage ? (
                            <Icon name="check_circle" className="size-5" strokeWidth={2.2} />
                        ) : (
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                                <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
                            </svg>
                        )}
                    </button>
                        </>
                    )}
                </div>
            </form>

            {/* Modal de criação de chamado */}
            {conversation && (
                <Suspense fallback={null}>
                    <TicketFromConvModal
                        conversation={conversation}
                        open={ticketModalOpen}
                        loading={isCreatingTicket}
                        error={createTicketError}
                        technicians={technicians}
                        onClose={() => setTicketModalOpen(false)}
                        onSubmit={handleCreateTicket}
                    />
                </Suspense>
            )}

            {conversation && closeModalOpen && (
                <div ref={closeDialogRef} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="close-conversation-title">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-lifted">
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <h2 id="close-conversation-title" className="text-lg font-bold text-foreground">Finalizar atendimento</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Registre o resultado e escolha exatamente o que será enviado ao cliente.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setCloseModalOpen(false); resetCloseForm(); }}
                                className="flex size-11 items-center justify-center rounded-lg text-lg text-muted-foreground hover:bg-surface-alt hover:text-foreground"
                                aria-label="Fechar modal"
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={submitCloseConversation} className="space-y-4">
                            {closeError && (
                                <div className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger-fg">
                                    {closeError}
                                </div>
                            )}

                            <fieldset>
                                <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Como deseja encerrar?</legend>
                                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                                    {([
                                        ['WITH_RATING', 'Encerrar com a avaliação', 'Envia a mensagem de encerramento e solicita uma nota de 1 a 10.'],
                                        ['INACTIVITY', 'Encerrar por inatividade/sem resposta', 'Envia somente a mensagem de encerramento, sem solicitar avaliação.'],
                                        ['SILENT', 'Encerrar sem mandar mensagem', 'Apenas fecha o atendimento e envia para o histórico.'],
                                    ] as const).map(([value, label, description]) => {
                                        const disabled = value === 'WITH_RATING' && conversation.contact.includeInServiceReports === false;
                                        const selected = closeForm.closureMode === value;
                                        return (
                                            <label key={value} className={`flex min-h-16 items-start gap-3 px-3 py-3 transition-colors ${disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:bg-surface-alt'} ${selected ? 'bg-primary-50' : 'bg-surface'}`}>
                                                <input type="radio" name="closureMode" value={value} checked={selected} disabled={disabled} onChange={() => setCloseForm({ ...closeForm, closureMode: value })} className="mt-1 size-4 accent-primary" />
                                                <span><span className="block text-sm font-semibold text-foreground">{label}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{disabled ? 'A avaliação está desativada no cadastro deste contato.' : description}</span></span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </fieldset>

                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resultado</span>
                                <select
                                    value={closeForm.result}
                                    onChange={(event) => setCloseForm({ ...closeForm, result: event.target.value })}
                                    required
                                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                                >
                                    <option value="">Selecione</option>
                                    <option value="RESOLVIDO">Resolvido</option>
                                    <option value="ENCAMINHADO_VISITA">Convertido em chamado</option>
                                    <option value="PENDENTE_CLIENTE">Pendente com cliente</option>
                                    <option value="SEM_SOLUCAO">Sem solucao no atendimento</option>
                                </select>
                            </label>

                            {customerBusinesses.length > 0 ? (
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Empresa atendida</span>
                                    <select
                                        value={closeForm.customerBusinessId}
                                        onChange={(event) => setCloseForm({ ...closeForm, customerBusinessId: event.target.value })}
                                        required
                                        className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                                    >
                                        <option value="">Selecione</option>
                                        {customerBusinesses.map((business) => (
                                            <option key={business.id} value={business.id}>
                                                {business.name} · CNPJ {business.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ) : (
                                <div className="rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-sm text-muted-foreground">
                                    Nenhuma empresa está vinculada a este cliente. O relatório será salvo sem empresa e CNPJ.
                                </div>
                            )}

                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sistema / assunto</span>
                                <select
                                    value={closeForm.serviceTopicId}
                                    onChange={(event) => setCloseForm({ ...closeForm, serviceTopicId: event.target.value })}
                                    required
                                    disabled={isLoadingServiceTopics && activeServiceTopics.length === 0}
                                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                                >
                                    <option value="">
                                        {isLoadingServiceTopics && activeServiceTopics.length === 0
                                            ? 'Carregando sistemas...'
                                            : 'Selecione'}
                                    </option>
                                    {activeServiceTopics.map((topic) => (
                                        <option key={topic.id} value={topic.id}>{topic.name}</option>
                                    ))}
                                </select>
                                {isLoadingServiceTopics && activeServiceTopics.length > 0 && (
                                    <span className="mt-1.5 block text-xs text-muted-foreground" role="status">
                                        Atualizando a lista de sistemas...
                                    </span>
                                )}
                            </label>

                            {serviceTopicsError && (
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger-fg" role="alert">
                                    <span>Não foi possível carregar os sistemas e assuntos.</span>
                                    <Button type="button" variant="outline" size="sm" onClick={() => void onReloadServiceTopics()}>
                                        Tentar novamente
                                    </Button>
                                </div>
                            )}

                            {!isLoadingServiceTopics && !serviceTopicsError && activeServiceTopics.length === 0 && (
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-sm text-muted-foreground">
                                    <span>Nenhum sistema ou assunto ativo foi encontrado.</span>
                                    <Button type="button" variant="outline" size="sm" onClick={() => void onReloadServiceTopics()}>
                                        Atualizar lista
                                    </Button>
                                </div>
                            )}

                            {requiresOtherDescription && (
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descreva o assunto</span>
                                    <input
                                        value={closeForm.otherTopicDescription}
                                        onChange={(event) => setCloseForm({ ...closeForm, otherTopicDescription: event.target.value })}
                                        required
                                        className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                                    />
                                </label>
                            )}

                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resumo do atendimento</span>
                                <textarea
                                    value={closeForm.summary}
                                    onChange={(event) => setCloseForm({ ...closeForm, summary: event.target.value })}
                                    required
                                    rows={4}
                                    placeholder="Explique o que o cliente precisava e como foi conduzido."
                                    className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Observacoes</span>
                                <textarea
                                    value={closeForm.notes}
                                    onChange={(event) => setCloseForm({ ...closeForm, notes: event.target.value })}
                                    rows={3}
                                    placeholder="Opcional"
                                    className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                                />
                            </label>

                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={closeForm.fieldServiceRequired}
                                    onChange={(event) => setCloseForm({ ...closeForm, fieldServiceRequired: event.target.checked })}
                                    className="h-4 w-4 accent-primary"
                                />
                                Foi necessário abrir um Chamado técnico
                            </label>

                            <div className="flex justify-end gap-3 pt-2">
                                <Button type="button" variant="outline" onClick={() => { setCloseModalOpen(false); resetCloseForm(); }}>
                                    Cancelar
                                </Button>
                                <Button type="submit" loading={isClosingConversation} disabled={!closeForm.closureMode}>
                                    {closeForm.closureMode === 'WITH_RATING' ? 'Encerrar com avaliação' : closeForm.closureMode === 'INACTIVITY' ? 'Encerrar por inatividade' : closeForm.closureMode === 'SILENT' ? 'Fechar sem mensagem' : 'Escolha como encerrar'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </section>
    );
}
