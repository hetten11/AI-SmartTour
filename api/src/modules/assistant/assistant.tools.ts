import type { ChatTool } from "../../common/llm.ts";
import { AppError } from "../../common/http-error.ts";
import { getWeather, getWeatherRange } from "../../common/weather.ts";
import { listEventsInRange } from "../events/events.service.ts";
import { savePlan, getItinerary } from "../itineraries/itineraries.service.ts";
import { planSchema } from "../itineraries/itineraries.schema.ts";
import { searchKnowledge } from "../knowledge/knowledge.service.ts";
import { listPlaces } from "../places/places.service.ts";
import { getProfile } from "../profiles/profiles.service.ts";
import { getTrip } from "../trips/trips.service.ts";

export const systemPrompt = [
  "Bạn là trợ lý du lịch Đà Nẵng, trả lời bằng tiếng Việt, ngắn gọn và thực tế.",
  "Chỉ dùng văn bản thường và Markdown đơn giản (đậm, gạch đầu dòng, danh sách số). Không dùng LaTeX hay công thức kiểu $\\rightarrow$; nối các điểm trong lịch trình bằng mũi tên →.",
  "Luôn gọi tool khi cần dữ liệu thật về địa điểm, sự kiện, thời tiết, thủ tục hoặc hồ sơ du khách.",
  "Không bịa địa điểm, sự kiện, giá cả hay số điện thoại. Nếu tool không có dữ liệu thì nói thẳng là chưa có.",
  "Khi người dùng muốn lịch trình, gọi save_itinerary sau khi đã tra địa điểm và sự kiện.",
  "Khi người dùng hỏi, nhận xét hoặc muốn sửa lịch trình của chuyến đi đang chọn, gọi get_trip trước. Không được nói là chưa có lịch trình khi chưa gọi get_trip.",
  "Muốn sửa lịch trình đang có: gọi get_trip, giữ nguyên các hoạt động không bị yêu cầu thay đổi, sửa danh sách items rồi gọi save_itinerary với TOÀN BỘ items. Lịch trình mới là một phiên bản mới, người dùng tự đặt làm bản chính.",
  "Với tình huống khẩn cấp (mất hộ chiếu, hành lý, cần số điện thoại), luôn gọi search_knowledge trước khi trả lời.",
].join(" ");

export const tools: ChatTool[] = [
  {
    type: "function",
    function: {
      name: "search_places",
      description: "Tìm địa điểm, nhà hàng, hoạt động ở Đà Nẵng theo từ khoá hoặc khu vực.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Từ khoá, ví dụ: bãi biển, cà phê, cầu rồng" },
          district: { type: "string", description: "Quận, ví dụ: Hải Châu, Sơn Trà" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_events",
      description: "Liệt kê sự kiện, lễ hội đang diễn ra trong khoảng ngày.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Ngày bắt đầu dạng YYYY-MM-DD" },
          to: { type: "string", description: "Ngày kết thúc dạng YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Xem dự báo thời tiết Đà Nẵng trong 7 ngày tới, có thể lọc theo một ngày.",
      parameters: {
        type: "object",
        properties: { date: { type: "string", description: "Ngày dạng YYYY-MM-DD, bỏ trống để lấy cả tuần" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description:
        "Tra cứu kiến thức du lịch: thủ tục, visa, lưu trú, mất hộ chiếu, số điện thoại khẩn cấp, thông tin địa điểm và sự kiện.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Câu hỏi hoặc từ khoá cần tra" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_profile",
      description: "Xem hồ sơ du khách: sở thích, ngân sách, phong cách, điều không muốn.",
    },
  },
  {
    type: "function",
    function: {
      name: "get_trip",
      description:
        "Xem chuyến đi đang chọn: ngày đi, số người và lịch trình đang dùng kèm hoạt động từng ngày. Gọi trước khi nhận xét hoặc sửa lịch trình có sẵn.",
    },
  },
  {
    type: "function",
    function: {
      name: "save_itinerary",
      description:
        "Lưu lịch trình cho chuyến đi đang chọn, dùng cho cả tạo mới và chỉnh sửa. Khi chỉnh sửa phải gọi get_trip trước và gửi lại TOÀN BỘ items của lịch trình (giữ cả những hoạt động không đổi), nếu không sẽ mất các hoạt động còn lại. Mỗi lần gọi tạo một phiên bản mới ở trạng thái nháp, ghi rõ thay đổi vào reason. Chỉ dùng id địa điểm/sự kiện lấy từ tool khác.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          reason: { type: "string", description: "Lý do hoặc thay đổi so với lịch trình trước" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                dayNumber: { type: "number", description: "Ngày thứ mấy, bắt đầu từ 1" },
                title: { type: "string" },
                itemType: {
                  type: "string",
                  enum: ["place", "restaurant", "activity", "event", "transport", "rest"],
                },
                placeId: { type: "string" },
                eventId: { type: "string" },
                startTime: {
                  type: "string",
                  description:
                    'Giờ bắt đầu đầy đủ dạng ISO 8601, ví dụ "2026-10-21T08:00:00+07:00". Bỏ trống nếu không cần giờ.',
                },
                estimatedCost: { type: "number" },
                notes: { type: "string" },
              },
              required: ["dayNumber", "title"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
];

const asArgs = (raw: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(raw === "" ? "{}" : raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const asText = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined);

export type ToolContext = {
  userId: string;
  tripId: string | null;
  chatSessionId?: string | null;
};

// Tool lỗi thì trả lỗi cho model đọc, không làm hỏng cả request.
export const runTool = async (
  name: string,
  rawArgs: string,
  context: ToolContext,
): Promise<unknown> => {
  const args = asArgs(rawArgs);

  try {
    switch (name) {
      case "search_places": {
        const result = await listPlaces({
          q: asText(args.query),
          district: asText(args.district),
        });
        return result.places.map((place) => ({
          id: place.id,
          name: place.name,
          category: place.category,
          district: place.district,
          address: place.address,
          avgRating: place.avgRating,
          priceLevel: place.priceLevel,
          tags: place.tags,
        }));
      }

      case "list_events": {
        const from = asText(args.from) ?? "2026-01-01";
        const to = asText(args.to) ?? "2030-12-31";
        const events = await listEventsInRange(
          new Date(`${from}T00:00:00.000Z`),
          new Date(`${to}T23:59:59.999Z`),
        );
        return events.map((event) => ({
          id: event.id,
          title: event.title,
          venue: event.venue,
          startAt: event.startAt,
          isFree: event.isFree,
          priceMin: event.priceMin,
        }));
      }

      case "get_weather": {
        const date = asText(args.date);
        return date ? await getWeather(date) : await getWeatherRange();
      }

      case "search_knowledge": {
        const query = asText(args.query);
        if (!query) return { error: "Thiếu từ khoá tra cứu" };
        const chunks = await searchKnowledge(query, 5);
        return chunks.map((chunk) => ({
          title: chunk.title,
          content: chunk.content,
          sourceType: chunk.sourceType,
          score: Number(chunk.distance.toFixed(4)),
        }));
      }

      case "get_profile":
        return (await getProfile(context.userId)) ?? { empty: true };

      case "get_trip": {
        if (!context.tripId) return { error: "Người dùng chưa chọn chuyến đi" };
        const trip = await getTrip(context.userId, context.tripId);
        const versions = trip.itineraries.map((row) => ({
          id: row.id,
          version: row.version,
          status: row.status,
          title: row.title,
        }));
        const summary = {
          title: trip.title,
          startDate: trip.startDate.toISOString().slice(0, 10),
          endDate: trip.endDate.toISOString().slice(0, 10),
          adults: trip.adults,
          children: trip.children,
          companions: trip.companions.map((companion) => ({
            name: companion.name,
            age: companion.age,
            gender: companion.gender,
          })),
          partySize: trip.adults + trip.children + trip.companions.length,
          notes: trip.notes,
        };
        const current =
          trip.itineraries.find((row) => row.status === "active") ?? trip.itineraries[0];
        if (!current) return { trip: summary, versions, itinerary: null };

        const { itinerary, places, events } = await getItinerary(context.userId, current.id);
        const placeNames = new Map(places.map((place) => [place.id, place.name]));
        const eventNames = new Map(events.map((event) => [event.id, event.title]));

        return {
          trip: summary,
          versions,
          itinerary: {
            id: itinerary.id,
            version: itinerary.version,
            status: itinerary.status,
            title: itinerary.title,
            reason: itinerary.reason,
            totalEstimatedCost: Number(itinerary.totalEstimatedCost ?? 0),
            items: itinerary.items.map((item) => ({
              dayNumber: item.dayNumber,
              title: item.title,
              itemType: item.itemType,
              place: item.placeId ? placeNames.get(item.placeId) ?? null : null,
              event: item.eventId ? eventNames.get(item.eventId) ?? null : null,
              startTime: item.startTime,
              estimatedCost: Number(item.estimatedCost ?? 0),
              notes: item.notes,
            })),
          },
        };
      }

      case "save_itinerary": {
        if (!context.tripId) {
          return { error: "Người dùng chưa chọn chuyến đi, hãy hỏi họ chọn chuyến đi trước" };
        }
        const plan = planSchema.safeParse(args);
        if (!plan.success) {
          return { error: `Dữ liệu lịch trình sai: ${plan.error.issues[0]?.message ?? "không rõ"}` };
        }
        const itinerary = await savePlan(
          context.userId,
          context.tripId,
          plan.data,
          "ai",
          context.chatSessionId ?? null,
        );
        return { id: itinerary.id, version: itinerary.version, itemCount: itinerary.items.length };
      }

      default:
        return { error: `Không có tool ${name}` };
    }
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    return { error: "Tool lỗi, thử cách khác" };
  }
};
