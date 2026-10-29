export type User = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string;
  role: string;
  createdAt: string;
};

export type Session = {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

export type LoginInput = { email: string; password: string };

export type RegisterInput = LoginInput & { fullName: string };

export type TravelerProfile = {
  id: string;
  nationality: string | null;
  language: string | null;
  originCity: string | null;
  budgetMin: string | null;
  budgetMax: string | null;
  currency: string | null;
  travelStyle: string | null;
  interests: string[];
  dislikes: string[];
};

export type ProfileInput = {
  nationality: string;
  language: string;
  originCity: string;
  budgetMin: string;
  budgetMax: string;
  currency: string;
  travelStyle: string;
  interests: string;
  dislikes: string;
};

export type Companion = {
  id: string;
  name: string | null;
  age: number | null;
  gender: string | null;
  notes: string | null;
};

export type CompanionInput = {
  name: string;
  age: string;
  gender: string;
  notes: string;
};

export type Trip = {
  id: string;
  title: string | null;
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  notes: string | null;
  companions: Companion[];
  itineraries?: {
    id: string;
    title: string | null;
    status: string;
    version: number;
    createdAt: string;
  }[];
  _count?: { itineraries: number };
};

export type TripInput = {
  title: string;
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  notes: string;
  companions: CompanionInput[];
};

export type Place = {
  id: string;
  slug: string | null;
  name: string;
  category: string;
  district: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  priceLevel: number | null;
  avgRating: string | null;
  tags: string[];
  description: string | null;
};

export type PlacePage = {
  places: Place[];
  total: number;
  page: number;
  pageSize: number;
};

export type Event = {
  id: string;
  title: string;
  description: string | null;
  venue: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  startAt: string;
  endAt: string | null;
  isFree: boolean | null;
  priceMin: string | null;
  priceMax: string | null;
  ticketUrl: string | null;
  tags: string[];
  currentVersion: number;
  isActive: boolean;
  source?: { name: string; url: string } | null;
};

export type EventPage = {
  events: Event[];
  total: number;
  page: number;
  pageSize: number;
};

// Admin nhập tay địa điểm/sự kiện, thay cho việc dựng file JSON.
export type PlaceInput = {
  name: string;
  category: string;
  description?: string | null;
  address?: string | null;
  district?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  priceLevel?: number | null;
  avgRating?: number | null;
  tags?: string[];
};

export type EventInput = {
  title: string;
  description?: string | null;
  venue?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  startAt: string;
  endAt?: string | null;
  isFree?: boolean | null;
  priceMin?: number | null;
  priceMax?: number | null;
  ticketUrl?: string | null;
  tags?: string[];
};

export type EventVersion = {
  id: string;
  versionNumber: number;
  changeType: string;
  changedFields: string[];
  detectedAt: string;
  snapshot: unknown;
};

export type DataSource = {
  id: string;
  name: string;
  url: string;
  sourceType: string | null;
  cronExpression: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  _count?: { events: number; syncRuns: number };
};

export type DataSourceInput = {
  name: string;
  sourceType: "file" | "api";
  url?: string;
  // Nội dung file JSON, chỉ gửi khi thêm hoặc thay file cho nguồn loại file.
  content?: string;
  cronExpression: string;
  isActive: boolean;
};

export type SyncRun = {
  id: string;
  status: string;
  itemsFetched: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsDeleted: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  source?: { name: string; url: string };
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
  tripId: string | null;
};

export type ChatSession = {
  id: string;
  tripId: string | null;
  title: string | null;
  lastMessageAt: string;
  createdAt: string;
  _count?: { messages: number };
};

export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  toolCalls: string[] | null;
  createdAt: string;
};

export type WeatherDay = {
  date: string;
  minTemp: number;
  maxTemp: number;
  rainMm: number;
  description: string;
  isRainy: boolean;
};

export type WeatherCurrent = {
  temp: number;
  description: string;
  isRainy: boolean;
};

export type WeatherReport = {
  days: WeatherDay[];
  current: WeatherCurrent;
};

export type ItineraryDiff = {
  from: { id: string; version: number; reason: string | null };
  to: { id: string; version: number; reason: string | null };
  added: ItineraryItem[];
  removed: ItineraryItem[];
  costDelta: number;
};

export type ItineraryItem = {
  id: string;
  dayNumber: number;
  orderIndex: number;
  itemType: string;
  placeId: string | null;
  eventId: string | null;
  title: string;
  startTime: string | null;
  endTime: string | null;
  estimatedCost: string | null;
  notes: string | null;
};

export type Itinerary = {
  id: string;
  tripId: string;
  version: number;
  title: string | null;
  status: string;
  reason: string | null;
  createdAt: string;
  totalEstimatedCost: string | null;
  chatSessionId: string | null;
  parentItineraryId: string | null;
  items: ItineraryItem[];
  _count?: { items: number };
};

export type ItineraryDetail = {
  itinerary: Itinerary;
  places: {
    id: string;
    name: string;
    address: string | null;
    latitude: string | null;
    longitude: string | null;
  }[];
  events: { id: string; title: string; venue: string | null; startAt: string }[];
};

export type Impact = {
  id: string;
  severity: number;
  description: string | null;
  isResolved: boolean;
  detectedAt: string;
  itineraryId: string;
  itineraryItem: { id: string; title: string; dayNumber: number } | null;
  eventVersion: { changeType: string; event: { title: string } };
};

export type AdminUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  _count?: { trips: number; sessions: number };
};

export type AdminStats = {
  users: number;
  places: number;
  events: number;
  knowledgeChunks: number;
  runningRuns: number;
  unreadNotifications: number;
};

export type ReindexResult = { places: number; events: number; policies: number };
