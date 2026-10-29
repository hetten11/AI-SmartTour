import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { revokeSession, sessionsQueryOptions } from "@/api";
import type { Session } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/sessions")({
  component: SessionsPage,
});

const dateTimeFormat = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});

const formatDateTime = (value: string) =>
  dateTimeFormat.format(new Date(value));

function SessionsPage() {
  const queryClient = useQueryClient();
  const query = useQuery(sessionsQueryOptions);
  const mutation = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phiên đăng nhập</CardTitle>
        <CardDescription>
          Các thiết bị đang đăng nhập vào tài khoản này.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <div className="grid gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : query.isError ? (
          <p className="text-destructive text-sm">{query.error.message}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thiết bị</TableHead>
                <TableHead>Đăng nhập</TableHead>
                <TableHead>Hoạt động cuối</TableHead>
                <TableHead>Hết hạn</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onRevoke={() => mutation.mutate(session.id)}
                  isRevoking={
                    mutation.isPending && mutation.variables === session.id
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
        {mutation.error ? (
          <p className="text-destructive mt-3 text-sm">
            {mutation.error.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SessionRow({
  session,
  onRevoke,
  isRevoking,
}: {
  session: Session;
  onRevoke: () => void;
  isRevoking: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="max-w-64 truncate">
        {session.userAgent ?? "Không rõ thiết bị"}
      </TableCell>
      <TableCell>{formatDateTime(session.createdAt)}</TableCell>
      <TableCell>{formatDateTime(session.lastSeenAt)}</TableCell>
      <TableCell>{formatDateTime(session.expiresAt)}</TableCell>
      <TableCell className="text-right">
        {session.isCurrent ? (
          <span className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs">
            Phiên hiện tại
          </span>
        ) : (
          <Button
            variant="destructive"
            size="sm"
            disabled={isRevoking}
            onClick={onRevoke}
          >
            {isRevoking ? "Đang thu hồi..." : "Thu hồi"}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
