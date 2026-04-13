import { useGetNotifications, useMarkNotificationRead, getGetNotificationsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCircle2, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

export default function Notifications() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  const { data, isLoading } = useGetNotifications({
    query: { queryKey: getGetNotificationsQueryKey() }
  });

  const markReadMutation = useMarkNotificationRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
      }
    }
  });

  const notifications = data?.data || [];

  const handleClick = (id: string, currentlyRead: boolean, entityType?: string | null, entityId?: string | null) => {
    if (!currentlyRead) {
      markReadMutation.mutate({ id });
    }
    if (entityType === "asset" && entityId) {
      setLocation(`/assets/${entityId}`);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Notifications</h2>
          <p className="text-muted-foreground">System alerts and updates.</p>
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : notifications.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card border rounded-lg">
            <Bell className="mx-auto h-12 w-12 opacity-20 mb-4" />
            <p>You have no notifications.</p>
          </div>
        ) : (
          notifications.map(n => {
            const hasLink = n.entityType === "asset" && n.entityId;
            return (
              <Card
                key={n.id}
                className={`cursor-pointer transition-colors ${!n.readStatus ? 'bg-primary/5 border-primary/20' : ''} ${hasLink ? 'hover:border-primary/40' : ''}`}
                onClick={() => handleClick(n.id!, n.readStatus || false, n.entityType, n.entityId)}
              >
                <CardContent className="p-4 flex gap-4">
                  <div className={`mt-1 flex-shrink-0 ${!n.readStatus ? 'text-primary' : 'text-muted-foreground'}`}>
                    {n.readStatus ? <CheckCircle2 className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className={`font-medium ${!n.readStatus ? 'text-foreground' : 'text-muted-foreground'}`}>{n.title}</h4>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasLink && (
                          <span className="text-xs text-primary flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> View Asset
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {n.createdAt && formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <p className={`text-sm ${!n.readStatus ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {n.message}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}