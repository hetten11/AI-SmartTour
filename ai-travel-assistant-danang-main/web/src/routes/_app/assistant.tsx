import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import {
  chatMessagesQueryOptions,
  chatSessionsQueryOptions,
  createChatSession,
  deleteChatSession,
  sendSessionMessage,
  tripsQueryOptions,
  updateChatSession,
} from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, formatDateTime } from "@/lib/display";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/assistant")({
  validateSearch: (search: Record<string, unknown>) => ({
    session: typeof search.session === "string" ? search.session : undefined,
  }),
  component: AssistantPage,
});

const presets = [
  { title: "Trời mưa", text: "Trời mưa thì nên đi đâu ở Đà Nẵng?" },
  { title: "Sự kiện", text: "Cuối tuần này có sự kiện gì?" },
  { title: "Lịch trình", text: "Lên lịch trình cho chuyến đi này" },
  { title: "Khẩn cấp", text: "Tôi bị mất hộ chiếu, phải làm gì?" },
];

// Gemini trả Markdown. Chỉ dựng vài dạng cần dùng (đậm, code, gạch đầu dòng,
// danh sách số) bằng React element, không dùng thư viện và không dùng
// dangerouslySetInnerHTML nên không có rủi ro XSS.
const renderInline = (text: string, keyPrefix: string): ReactNode[] =>
  text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g)
    .filter((part) => part !== "")
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={key} className="bg-muted rounded px-1 py-0.5 text-[0.85em]">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={key}>{part.slice(1, -1)}</em>;
      }
      return part;
    });

function RichText({ text }: { text: string }) {
  // Gemini đôi khi chèn LaTeX kiểu $\rightarrow$ dù prompt đã dặn: đổi về mũi tên.
  text = text.replace(/\$?\\(?:rightarrow|to|Rightarrow)\$?/g, "→");

  const blocks: ReactNode[] = [];
  let items: string[] = [];
  let ordered = false;

  const flush = () => {
    if (items.length === 0) return;
    const Tag = ordered ? "ol" : "ul";
    const key = `list-${blocks.length}`;
    blocks.push(
      <Tag
        key={key}
        className={ordered ? "grid list-decimal gap-1 pl-5" : "grid list-disc gap-1 pl-5"}
      >
        {items.map((item, index) => (
          <li key={`${key}-${index}`}>{renderInline(item, `${key}-${index}`)}</li>
        ))}
      </Tag>,
    );
    items = [];
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (heading) {
      flush();
      const key = `h-${blocks.length}`;
      blocks.push(
        <p key={key} className="font-semibold">
          {renderInline(heading[1] ?? "", key)}
        </p>,
      );
      continue;
    }

    if (bullet || numbered) {
      const wantsOrdered = Boolean(numbered);
      if (wantsOrdered !== ordered) flush();
      ordered = wantsOrdered;
      items.push((bullet?.[1] ?? numbered?.[1] ?? "").trim());
      continue;
    }

    flush();
    if (line.trim() !== "") {
      blocks.push(<p key={`p-${blocks.length}`}>{renderInline(line, `p-${blocks.length}`)}</p>);
    }
  }
  flush();

  return <div className="grid gap-2">{blocks}</div>;
}

function TypingDots() {
  return (
    <div className="bg-background mr-auto flex w-fit items-center gap-1 rounded-xl rounded-bl-sm px-4 py-3 ring-1 ring-foreground/10">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="bg-muted-foreground size-1.5 animate-bounce rounded-full"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

function MessageFooter({
  role,
  createdAt,
  toolCalls,
}: {
  role: string;
  createdAt: string;
  toolCalls: string[] | null;
}) {
  return (
    <div
      className={
        role === "user"
          ? "text-primary-foreground/70 mt-2 flex flex-wrap items-center justify-end gap-1.5 text-[11px]"
          : "text-muted-foreground mt-2 flex flex-wrap items-center gap-1.5 text-[11px]"
      }
    >
      <span>{formatDateTime(createdAt)}</span>
      {(toolCalls ?? []).map((tool: string) => (
        <Badge key={tool} variant="outline" className="text-[10px] font-normal">
          {tool}
        </Badge>
      ))}
    </div>
  );
}

function AssistantPage() {
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const { session: sessionParam } = Route.useSearch();
  const trips = useQuery(tripsQueryOptions);
  const [tripId, setTripId] = useState("");
  const [content, setContent] = useState("");
  // Trợ lý chạm maxSteps vòng tool: câu trả lời có thể bị cắt, cảnh báo người dùng.
  const [truncated, setTruncated] = useState(false);
  const [editingSession, setEditingSession] = useState<{ id: string; title: string } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingSession, setDeletingSession] = useState<{
    id: string;
    title: string | null;
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sessions = useQuery(chatSessionsQueryOptions());
  const sessionId = sessionParam ?? "";
  const messages = useQuery({
    ...chatMessagesQueryOptions(sessionId === "" ? "none" : sessionId),
    enabled: sessionId !== "",
  });

  // Chưa chọn phiên thì mở phiên mới nhất.
  useEffect(() => {
    const first = sessions.data?.[0];
    if (!sessionParam && first) void navigate({ search: { session: first.id } });
  }, [navigate, sessionParam, sessions.data]);

  const refreshSessions = () =>
    queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });

  const createSession = useMutation({
    mutationFn: () => createChatSession({ tripId: tripId === "" ? null : tripId }),
    onSuccess: async (result) => {
      await refreshSessions();
      await navigate({ search: { session: result.session.id } });
    },
  });

  const renameSession = useMutation({
    mutationFn: (input: { id: string; title: string }) =>
      updateChatSession(input.id, { title: input.title }),
    onSuccess: async () => {
      await refreshSessions();
      setEditingSession(null);
    },
  });

  const removeSession = useMutation({
    mutationFn: deleteChatSession,
    onSuccess: async (_data, id) => {
      await refreshSessions();
      if (id === sessionId) await navigate({ search: { session: undefined } });
      setDeletingSession(null);
    },
  });

  // Gắn hoặc đổi chuyến đi cho phiên đang mở; phiên không có chuyến đi thì
  // trợ lý không lưu được lịch trình.
  const bindTrip = useMutation({
    mutationFn: (nextTripId: string) =>
      updateChatSession(sessionId, { tripId: nextTripId === "" ? null : nextTripId }),
    onSuccess: refreshSessions,
  });

  const send = useMutation({
    mutationFn: (text: string) => sendSessionMessage(sessionId, text),
    onError: (_error, text) => setContent((current) => (current === "" ? text : current)),
    onSuccess: async (data) => {
      setTruncated(data.truncated);
      await queryClient.invalidateQueries({ queryKey: ["chat", sessionId] });
      await refreshSessions();
    },
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.data, send.isPending]);

  // auto-grow textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [content]);

  const submit = (override?: string) => {
    const text = (override ?? content).trim();
    if (text === "" || send.isPending || sessionId === "") return;
    setContent("");
    setTruncated(false);
    send.mutate(text);
  };

  const history = messages.data ?? [];
  const isEmpty = !messages.isPending && history.length === 0 && !send.isPending;
  const session = sessions.data?.find((row) => row.id === sessionId);

  return (
    <div className="flex h-[calc(100dvh-9rem)] w-full gap-4 overflow-hidden">
      {/* Danh sách phiên */}
      <aside className="flex w-64 shrink-0 flex-col gap-2 border-r pr-3">
        <Button
          variant="outline"
          className="w-full justify-start"
          disabled={createSession.isPending}
          onClick={() => createSession.mutate()}
        >
          <MessageSquarePlus />
          Phiên mới
        </Button>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden pr-1">
          {sessions.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : (sessions.data ?? []).length === 0 ? (
            <p className="text-muted-foreground px-1 text-xs">Chưa có phiên chat nào.</p>
          ) : (
            sessions.data?.map((row) => (
              <div
                key={row.id}
                className={cn(
                  "group flex min-w-0 items-center gap-1 rounded-lg px-2 py-1.5",
                  row.id === sessionId ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => void navigate({ search: { session: row.id } })}
                >
                  <div className="truncate text-sm">{row.title ?? "Phiên chưa có tiêu đề"}</div>
                  <div className="text-muted-foreground truncate text-[11px]">
                    {formatDateTime(row.lastMessageAt)} · {row._count?.messages ?? 0} tin
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  title="Đổi tên phiên"
                  aria-label={`Đổi tên phiên ${row.title ?? "chưa có tiêu đề"}`}
                  onClick={() => {
                    const title = row.title ?? "";
                    renameSession.reset();
                    setEditingSession({ id: row.id, title });
                    setEditTitle(title);
                  }}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  title="Xoá phiên"
                  aria-label={`Xoá phiên ${row.title ?? "chưa có tiêu đề"}`}
                  onClick={() => {
                    removeSession.reset();
                    setDeletingSession({ id: row.id, title: row.title });
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))
          )}
        </div>
        {createSession.error || bindTrip.error ? (
          <p className="text-destructive text-xs">
            {errorMessage(createSession.error ?? bindTrip.error)}
          </p>
        ) : null}
      </aside>

      <Dialog
        open={editingSession !== null}
        onOpenChange={(open) => {
          if (!open && !renameSession.isPending) setEditingSession(null);
        }}
      >
        <DialogContent>
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              const title = editTitle.trim();
              if (editingSession && title !== "") {
                renameSession.mutate({ id: editingSession.id, title });
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Đổi tên phiên chat</DialogTitle>
              <DialogDescription>
                Tên mới giúp bạn dễ tìm lại cuộc trò chuyện.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="chat-session-title">Tên phiên</Label>
              <Input
                id="chat-session-title"
                autoFocus
                maxLength={120}
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
              />
            </div>
            {renameSession.error ? (
              <p className="text-destructive text-sm" role="alert">
                {errorMessage(renameSession.error)}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={renameSession.isPending}
                onClick={() => setEditingSession(null)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                disabled={
                  renameSession.isPending ||
                  editTitle.trim() === "" ||
                  editTitle.trim() === editingSession?.title
                }
              >
                {renameSession.isPending ? "Đang lưu..." : "Lưu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingSession !== null}
        onOpenChange={(open) => {
          if (!open && !removeSession.isPending) setDeletingSession(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá phiên chat?</AlertDialogTitle>
            <AlertDialogDescription>
              Phiên “{deletingSession?.title ?? "Phiên chưa có tiêu đề"}” và toàn bộ tin nhắn sẽ
              bị xoá. Không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeSession.error ? (
            <p className="text-destructive text-sm" role="alert">
              {errorMessage(removeSession.error)}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeSession.isPending}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeSession.isPending}
              onClick={() => {
                if (deletingSession) removeSession.mutate(deletingSession.id);
              }}
            >
              {removeSession.isPending ? "Đang xoá..." : "Xoá phiên"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Khung chat */}
      <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-medium">{session?.title ?? "Trợ lý du lịch"}</h1>
            <p className="text-muted-foreground text-sm">
              {sessionId === ""
                ? "Chọn một phiên bên trái hoặc bấm \"Phiên mới\"."
                : `Tra cứu địa điểm, sự kiện, thời tiết, thủ tục trước khi trả lời. ${session?._count?.messages ?? 0} tin nhắn.`}
            </p>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="chat-trip" className="text-xs">
              {sessionId === "" ? "Chuyến đi cho phiên mới" : "Chuyến đi của phiên"}
            </Label>
            <select
              id="chat-trip"
              className="border-input h-8 max-w-56 rounded-lg border bg-transparent px-2 text-sm"
              value={sessionId === "" ? tripId : (session?.tripId ?? "")}
              disabled={bindTrip.isPending}
              onChange={(event) => {
                if (sessionId === "") setTripId(event.target.value);
                else bindTrip.mutate(event.target.value);
              }}
            >
              <option value="">Không gắn chuyến đi</option>
              {(trips.data ?? []).map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.title ?? "Chuyến đi chưa đặt tên"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {sessionId !== "" && session && session.tripId === null ? (
          <p className="text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 text-xs">
            Phiên chưa gắn chuyến đi: trợ lý trả lời được nhưng không lưu được lịch trình. Chọn
            chuyến đi ở ô phía trên.
          </p>
        ) : null}

        <div
          ref={listRef}
          className="bg-muted/30 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl p-4"
        >
          {sessionId === "" ? (
            <p className="text-muted-foreground m-auto text-sm">
              Chọn một phiên bên trái hoặc bấm "Phiên mới".
            </p>
          ) : messages.isPending ? (
            <>
              <Skeleton className="h-12 w-2/3" />
              <Skeleton className="ml-auto h-10 w-1/2" />
              <Skeleton className="h-16 w-3/4" />
            </>
          ) : isEmpty ? (
            <div className="m-auto grid w-full gap-4 text-center">
              <div>
                <p className="font-medium">Hỏi gì cũng được về chuyến đi Đà Nẵng</p>
                <p className="text-muted-foreground text-sm">Hoặc thử một gợi ý:</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {presets.map((preset) => (
                  <button
                    key={preset.text}
                    type="button"
                    onClick={() => submit(preset.text)}
                    className="bg-background hover:bg-accent rounded-lg px-3 py-2.5 text-left ring-1 ring-foreground/10 transition-colors"
                  >
                    <div className="text-xs font-medium">{preset.title}</div>
                    <div className="text-muted-foreground text-sm">{preset.text}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {history.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-auto w-fit max-w-[min(75ch,85%)]"
                      : "mr-auto w-fit max-w-[min(75ch,85%)]"
                  }
                >
                  <div
                    className={
                      message.role === "user"
                        ? "bg-primary text-primary-foreground rounded-xl rounded-br-sm px-3.5 py-2 text-sm"
                        : "bg-background rounded-xl rounded-bl-sm px-3.5 py-2 text-sm ring-1 ring-foreground/10"
                    }
                  >
                    {message.role === "user" ? (
                      <div className="whitespace-pre-wrap break-words">{message.content}</div>
                    ) : (
                      <RichText text={message.content} />
                    )}
                    <MessageFooter
                      role={message.role}
                      createdAt={message.createdAt}
                      toolCalls={message.toolCalls}
                    />
                  </div>
                </div>
              ))}

              {send.isPending && send.variables ? (
                <>
                  <div className="bg-primary text-primary-foreground ml-auto w-fit max-w-[min(75ch,85%)] rounded-xl rounded-br-sm px-3.5 py-2 text-sm opacity-70">
                    <div className="whitespace-pre-wrap break-words">{send.variables}</div>
                  </div>
                  <TypingDots />
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="grid gap-2">
          {truncated ? (
            <p
              className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
              role="alert"
            >
              Trợ lý đã dùng hết 8 lượt gọi công cụ nên câu trả lời có thể bị cắt. Hỏi lại ngắn hơn
              hoặc chia nhỏ yêu cầu.
            </p>
          ) : null}
          {send.error ? (
            <p className="text-destructive text-sm" role="alert">
              {errorMessage(send.error)}
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              rows={1}
              className="max-h-40 min-h-10 resize-none"
              placeholder="Hỏi về địa điểm, sự kiện, thời tiết, thủ tục hoặc nhờ lên lịch trình..."
              value={content}
              disabled={sessionId === ""}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <Button
              disabled={send.isPending || sessionId === "" || content.trim() === ""}
              onClick={() => submit()}
            >
              {send.isPending ? "Đang xử lý..." : "Gửi"}
            </Button>
          </div>
          <span className="text-muted-foreground text-xs">
            Enter để gửi, Shift + Enter xuống dòng
          </span>
        </div>
      </section>
    </div>
  );
}
