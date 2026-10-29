import { queryOptions } from "@tanstack/react-query";
import type {
  AdminStats,
  AdminUser,
  AppNotification,
  ChatMessage,
  ChatSession,
  DataSource,
  DataSourceInput,
  Event,
  EventInput,
  EventPage,
  EventVersion,
  Impact,
  Itinerary,
  ItineraryDetail,
  ItineraryDiff,
  ItineraryItem,
  LoginInput,
  Place,
  PlaceInput,
  PlacePage,
  ProfileInput,
  RegisterInput,
  Session,
  SyncRun,
  TravelerProfile,
  Trip,
  TripInput,
  User,
  WeatherReport,
} from "./contract";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const readError = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      return String(body.error);
    }
  } catch {
    // api không trả JSON, rơi xuống câu mặc định bên dưới.
  }
  return `Lỗi hệ thống (${response.status})`;
};

// 401 ở các route này là sai thông tin đăng nhập, không phải access token hết
// hạn, nên không thử refresh.
const publicPaths = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
]);

let refreshing: Promise<void> | null = null;

// Nhiều request 401 cùng lúc thì chỉ refresh một lần.
const refreshAccess = (): Promise<void> => {
  refreshing ??= (async () => {
    try {
      await request("/api/auth/refresh", "POST");
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
};

const request = async <T>(
  path: string,
  method: string,
  body?: unknown,
  canRefresh = true,
): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    // ponytail: cookie phiên là httpOnly, thiếu credentials thì api trả 401.
    credentials: "include",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Access token ngắn hạn: gặp 401 thì đổi refresh token lấy token mới rồi thử
  // lại đúng một lần.
  if (response.status === 401 && canRefresh && !publicPaths.has(path)) {
    await refreshAccess();
    return request<T>(path, method, body, false);
  }
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

export const getMe = async (): Promise<User> =>
  (await request<{ user: User }>("/api/auth/me", "GET")).user;

export const login = async (input: LoginInput): Promise<User> =>
  (await request<{ user: User }>("/api/auth/login", "POST", input)).user;

export const register = async (input: RegisterInput): Promise<User> =>
  (await request<{ user: User }>("/api/auth/register", "POST", input)).user;

export const logout = (): Promise<void> =>
  request<void>("/api/auth/logout", "POST");

export const listSessions = async (): Promise<Session[]> =>
  (await request<{ sessions: Session[] }>("/api/auth/sessions", "GET")).sessions;

export const revokeSession = (id: string): Promise<void> =>
  request<void>(`/api/auth/sessions/${id}`, "DELETE");

export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: getMe,
  staleTime: 30_000,
});

export const sessionsQueryOptions = queryOptions({
  queryKey: ["sessions"],
  queryFn: listSessions,
});

// ---------------------------------------------------------------- tiện ích

type QueryParams = Record<string, string | number | boolean | undefined>;

const queryString = (params: QueryParams): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text === "" ? "" : `?${text}`;
};

const post = <T>(path: string, body?: unknown) => request<T>(path, "POST", body);
const patch = <T>(path: string, body?: unknown) => request<T>(path, "PATCH", body);
const put = <T>(path: string, body?: unknown) => request<T>(path, "PUT", body);
const remove = <T>(path: string) => request<T>(path, "DELETE");

// ----------------------------------------------------------- hồ sơ du khách

export const getProfile = async (): Promise<TravelerProfile | null> =>
  (await request<{ profile: TravelerProfile | null }>("/api/profile", "GET")).profile;

const asList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

const profilePayload = (input: ProfileInput) => ({
  nationality: input.nationality === "" ? null : input.nationality,
  language: input.language === "" ? null : input.language,
  originCity: input.originCity === "" ? null : input.originCity,
  budgetMin: input.budgetMin === "" ? null : Number(input.budgetMin),
  budgetMax: input.budgetMax === "" ? null : Number(input.budgetMax),
  currency: input.currency === "" ? null : input.currency,
  travelStyle: input.travelStyle === "" ? null : input.travelStyle,
  interests: asList(input.interests),
  dislikes: asList(input.dislikes),
});

export const saveProfile = async (input: ProfileInput): Promise<TravelerProfile> =>
  (await put<{ profile: TravelerProfile }>("/api/profile", profilePayload(input))).profile;

export const profileQueryOptions = queryOptions({
  queryKey: ["profile"],
  queryFn: getProfile,
});

// ---------------------------------------------------------------- chuyến đi

const tripPayload = (input: TripInput) => ({
  title: input.title,
  startDate: input.startDate,
  endDate: input.endDate,
  adults: Number(input.adults) || 1,
  children: Number(input.children) || 0,
  notes: input.notes,
  companions: input.companions.map((companion) => ({
    name: companion.name === "" ? null : companion.name,
    age: companion.age === "" ? null : Number(companion.age),
    gender: companion.gender === "" ? null : companion.gender,
    notes: companion.notes === "" ? null : companion.notes,
  })),
});

export const listTrips = async (): Promise<Trip[]> =>
  (await request<{ trips: Trip[] }>("/api/trips", "GET")).trips;

export const getTrip = async (id: string): Promise<Trip> =>
  (await request<{ trip: Trip }>(`/api/trips/${id}`, "GET")).trip;

export const createTrip = async (input: TripInput): Promise<Trip> =>
  (await post<{ trip: Trip }>("/api/trips", tripPayload(input))).trip;

export const updateTrip = async (id: string, input: TripInput): Promise<Trip> =>
  (await patch<{ trip: Trip }>(`/api/trips/${id}`, tripPayload(input))).trip;

export const deleteTrip = (id: string) => remove<void>(`/api/trips/${id}`);

export const tripsQueryOptions = queryOptions({ queryKey: ["trips"], queryFn: listTrips });

export const tripQueryOptions = (id: string) =>
  queryOptions({ queryKey: ["trips", id], queryFn: () => getTrip(id) });

// ----------------------------------------------------------------- địa điểm

export type PlaceFilters = { q?: string; district?: string; category?: string; page?: number };

export const listPlaces = (filters: PlaceFilters = {}): Promise<PlacePage> =>
  request<PlacePage>(`/api/places${queryString(filters)}`, "GET");

export const getPlace = async (id: string): Promise<Place> =>
  (await request<{ place: Place }>(`/api/places/${id}`, "GET")).place;

export const listDistricts = async (): Promise<string[]> =>
  (
    await request<{ districts: (string | null)[] }>("/api/places/districts", "GET")
  ).districts.filter((district): district is string => district !== null);

export const placesQueryOptions = (filters: PlaceFilters = {}) =>
  queryOptions({ queryKey: ["places", filters], queryFn: () => listPlaces(filters) });

export const districtsQueryOptions = queryOptions({
  queryKey: ["places", "districts"],
  queryFn: listDistricts,
  staleTime: 5 * 60_000,
});

// Ghi địa điểm/sự kiện bằng tay, chỉ admin gọi được (route /api/admin/*).
export const createPlace = async (input: PlaceInput): Promise<Place> =>
  (await post<{ place: Place }>("/api/admin/places", input)).place;

export const updatePlace = async (id: string, input: Partial<PlaceInput>): Promise<Place> =>
  (await patch<{ place: Place }>(`/api/admin/places/${id}`, input)).place;

export const deletePlace = (id: string) => remove<void>(`/api/admin/places/${id}`);

// ----------------------------------------------------------------- sự kiện

export type EventFilters = { q?: string; from?: string; to?: string; page?: number };

export const listEvents = (filters: EventFilters = {}): Promise<EventPage> =>
  request<EventPage>(`/api/events${queryString(filters)}`, "GET");

export const getEvent = async (id: string): Promise<Event> =>
  (await request<{ event: Event }>(`/api/events/${id}`, "GET")).event;

export const listEventVersions = async (id: string): Promise<EventVersion[]> =>
  (await request<{ versions: EventVersion[] }>(`/api/events/${id}/versions`, "GET")).versions;

export const eventsQueryOptions = (filters: EventFilters = {}) =>
  queryOptions({ queryKey: ["events", filters], queryFn: () => listEvents(filters) });

export const eventQueryOptions = (id: string) =>
  queryOptions({ queryKey: ["events", id], queryFn: () => getEvent(id) });

export const eventVersionsQueryOptions = (id: string) =>
  queryOptions({ queryKey: ["events", id, "versions"], queryFn: () => listEventVersions(id) });

export const createEvent = async (input: EventInput): Promise<Event> =>
  (await post<{ event: Event }>("/api/admin/events", input)).event;

export const updateEvent = async (id: string, input: Partial<EventInput>): Promise<Event> =>
  (await patch<{ event: Event }>(`/api/admin/events/${id}`, input)).event;

export const deleteEvent = (id: string) => remove<void>(`/api/admin/events/${id}`);

// --------------------------------------------------------- đồng bộ dữ liệu

export const listSyncRuns = async (sourceId?: string): Promise<SyncRun[]> =>
  (await request<{ runs: SyncRun[] }>(`/api/sync-runs${queryString({ sourceId })}`, "GET")).runs;

export const syncRunsQueryOptions = (sourceId?: string) =>
  queryOptions({
    queryKey: ["sync-runs", sourceId ?? "all"],
    queryFn: () => listSyncRuns(sourceId),
  });

// --------------------------------------------------------------- thông báo

export const listNotifications = () =>
  request<{ notifications: AppNotification[]; unread: number }>("/api/notifications", "GET");

export const markNotificationRead = (id: string) => post<void>(`/api/notifications/${id}/read`);

export const markAllNotificationsRead = () => post<void>("/api/notifications/read-all");

export const notificationsQueryOptions = queryOptions({
  queryKey: ["notifications"],
  queryFn: listNotifications,
  refetchInterval: 60_000,
});

// ------------------------------------------------------------- trợ lý AI

export const listChatSessions = async (tripId?: string): Promise<ChatSession[]> =>
  (
    await request<{ sessions: ChatSession[] }>(
      `/api/chat/sessions${queryString({ tripId })}`,
      "GET",
    )
  ).sessions;

export const createChatSession = async (input: { tripId?: string | null } = {}) =>
  post<{ session: ChatSession }>("/api/chat/sessions", input);

export const updateChatSession = (id: string, data: { title?: string | null; tripId?: string | null }) =>
  patch<{ session: ChatSession }>(`/api/chat/sessions/${id}`, data);

export const deleteChatSession = (id: string) => remove<void>(`/api/chat/sessions/${id}`);

export const listSessionMessages = async (sessionId: string): Promise<ChatMessage[]> =>
  (await request<{ messages: ChatMessage[] }>(`/api/chat/sessions/${sessionId}/messages`, "GET"))
    .messages;

export const sendSessionMessage = (sessionId: string, content: string) =>
  post<{ message: ChatMessage; usedTools: string[]; truncated: boolean }>(
    `/api/chat/sessions/${sessionId}/messages`,
    { content },
  );

export const chatSessionsQueryOptions = (tripId?: string) =>
  queryOptions({
    queryKey: ["chat-sessions", tripId ?? "all"],
    queryFn: () => listChatSessions(tripId),
  });

export const chatMessagesQueryOptions = (sessionId: string) =>
  queryOptions({
    queryKey: ["chat", sessionId],
    queryFn: () => listSessionMessages(sessionId),
  });

// ------------------------------------------------------------ thời tiết

export const listWeather = (): Promise<WeatherReport> =>
  request<WeatherReport>("/api/weather", "GET");

export const weatherQueryOptions = queryOptions({
  queryKey: ["weather"],
  queryFn: listWeather,
  staleTime: 10 * 60_000,
});

// --------------------------------------------------------------- lịch trình

export const listItineraries = async (tripId: string): Promise<Itinerary[]> =>
  (await request<{ itineraries: Itinerary[] }>(`/api/trips/${tripId}/itineraries`, "GET"))
    .itineraries;

export const generateItinerary = async (
  tripId: string,
  input: { notes?: string } = {},
): Promise<Itinerary> =>
  (await post<{ itinerary: Itinerary }>(`/api/trips/${tripId}/itineraries`, input)).itinerary;

export const getItinerary = (id: string) =>
  request<ItineraryDetail>(`/api/itineraries/${id}`, "GET");

export const updateItineraryItem = (
  itineraryId: string,
  itemId: string,
  data: { dayNumber?: number; orderIndex?: number; title?: string; notes?: string | null },
) => patch<{ item: ItineraryItem }>(`/api/itineraries/${itineraryId}/items/${itemId}`, data);

export const listImpacts = async (tripId: string): Promise<Impact[]> =>
  (await request<{ impacts: Impact[] }>(`/api/trips/${tripId}/impacts`, "GET")).impacts;

export const applyImpact = async (itineraryId: string, impactId: string): Promise<Itinerary> =>
  (
    await post<{ itinerary: Itinerary }>(
      `/api/itineraries/${itineraryId}/apply-impact/${impactId}`,
    )
  ).itinerary;

// Sinh phiên bản mới theo kịch bản (what-if), không tự áp dụng.
export const runWhatIf = (
  tripId: string,
  input: { itineraryId: string; scenario: string; chatSessionId?: string | null },
) =>
  post<{ itinerary: Itinerary; diff: ItineraryDiff }>(
    `/api/trips/${tripId}/itineraries/what-if`,
    input,
  );

export const getItineraryDiff = async (id: string, withId: string): Promise<ItineraryDiff> =>
  (
    await request<{ diff: ItineraryDiff }>(
      `/api/itineraries/${id}/diff${queryString({ with: withId })}`,
      "GET",
    )
  ).diff;

export const activateItinerary = async (id: string): Promise<Itinerary> =>
  (await post<{ itinerary: Itinerary }>(`/api/itineraries/${id}/activate`)).itinerary;

export const deleteItinerary = (id: string) => remove<void>(`/api/itineraries/${id}`);

export const addItineraryItem = (
  itineraryId: string,
  data: {
    dayNumber: number;
    title: string;
    itemType?: string;
    placeId?: string | null;
    eventId?: string | null;
    notes?: string | null;
  },
) => post<{ itinerary: Itinerary }>(`/api/itineraries/${itineraryId}/items`, data);

export const itinerariesQueryOptions = (tripId: string) =>
  queryOptions({ queryKey: ["itineraries", tripId], queryFn: () => listItineraries(tripId) });

export const itineraryQueryOptions = (id: string) =>
  queryOptions({ queryKey: ["itinerary", id], queryFn: () => getItinerary(id) });

export const impactsQueryOptions = (tripId: string) =>
  queryOptions({ queryKey: ["impacts", tripId], queryFn: () => listImpacts(tripId) });

// ---------------------------------------------------------------- quản trị

export const getAdminStats = () => request<AdminStats>("/api/admin/stats", "GET");

export const listAdminUsers = (filters: { q?: string; page?: number } = {}) =>
  request<{ users: AdminUser[]; total: number }>(
    `/api/admin/users${queryString(filters)}`,
    "GET",
  );

export const updateAdminUser = (id: string, data: { isActive?: boolean; role?: string }) =>
  patch<{ user: AdminUser }>(`/api/admin/users/${id}`, data);

export const listSources = async (): Promise<DataSource[]> =>
  (await request<{ sources: DataSource[] }>("/api/admin/sources", "GET")).sources;

export const createSource = async (input: DataSourceInput): Promise<DataSource> =>
  (await post<{ source: DataSource }>("/api/admin/sources", input)).source;

export const updateSource = async (
  id: string,
  input: Partial<DataSourceInput>,
): Promise<DataSource> =>
  (await patch<{ source: DataSource }>(`/api/admin/sources/${id}`, input)).source;

export const deleteSource = (id: string) => remove<void>(`/api/admin/sources/${id}`);

export const runSource = (id: string) => post<{ run: SyncRun }>(`/api/admin/sources/${id}/run`);

export const reindexKnowledge = () =>
  post<{ places: number; events: number; policies: number }>("/api/admin/knowledge/reindex");

export const adminStatsQueryOptions = queryOptions({
  queryKey: ["admin", "stats"],
  queryFn: getAdminStats,
});

export const adminUsersQueryOptions = (filters: { q?: string; page?: number } = {}) =>
  queryOptions({ queryKey: ["admin", "users", filters], queryFn: () => listAdminUsers(filters) });

export const sourcesQueryOptions = queryOptions({
  queryKey: ["admin", "sources"],
  queryFn: listSources,
});
