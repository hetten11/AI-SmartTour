import { AppError } from "./http-error.ts";

// Open-Meteo: miễn phí, không cần key. Toạ độ trung tâm Đà Nẵng.
const latitude = 16.0544;
const longitude = 108.2022;
const cacheMs = 10 * 60 * 1000;

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

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
  };
};

const descriptions: Record<number, string> = {
  0: "Trời quang",
  1: "Ít mây",
  2: "Có mây",
  3: "Nhiều mây",
  45: "Sương mù",
  48: "Sương mù đóng băng",
  51: "Mưa phùn nhẹ",
  53: "Mưa phùn",
  55: "Mưa phùn dày",
  61: "Mưa nhỏ",
  63: "Mưa vừa",
  65: "Mưa to",
  80: "Mưa rào nhẹ",
  81: "Mưa rào",
  82: "Mưa rào rất to",
  95: "Dông",
  96: "Dông kèm mưa đá",
  99: "Dông lớn kèm mưa đá",
};

const isRainy = (code: number, rainMm: number) => rainMm >= 1 || (code >= 51 && code <= 99);

// ponytail: cache trong bộ nhớ 10 phút, mất khi restart. Đổi sang Redis khi
// chạy nhiều instance.
let cached: { at: number; days: Map<string, WeatherDay>; current: WeatherCurrent } | null = null;

const load = async (): Promise<{ days: Map<string, WeatherDay>; current: WeatherCurrent }> => {
  if (cached && Date.now() - cached.at < cacheMs) return cached;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum" +
    "&current=temperature_2m,weather_code" +
    "&timezone=Asia%2FBangkok&forecast_days=7";

  const response = await fetch(url);
  if (!response.ok) throw new AppError(502, "Không lấy được dữ liệu thời tiết");
  const payload = (await response.json()) as OpenMeteoResponse;
  const daily = payload.daily;
  const currentCode = payload.current?.weather_code ?? 0;
  const days = new Map<string, WeatherDay>();

  daily?.time?.forEach((date, index) => {
    const code = daily.weather_code?.[index] ?? 0;
    const rainMm = daily.precipitation_sum?.[index] ?? 0;
    days.set(date, {
      date,
      minTemp: daily.temperature_2m_min?.[index] ?? 0,
      maxTemp: daily.temperature_2m_max?.[index] ?? 0,
      rainMm,
      description: descriptions[code] ?? "Không rõ",
      isRainy: isRainy(code, rainMm),
    });
  });

  const current: WeatherCurrent = {
    temp: payload.current?.temperature_2m ?? 0,
    description: descriptions[currentCode] ?? "Không rõ",
    isRainy: isRainy(currentCode, 0),
  };

  cached = { at: Date.now(), days, current };
  return cached;
};

export const getWeather = async (date: string): Promise<WeatherDay> => {
  const { days } = await load();
  const day = days.get(date);
  if (!day) throw new AppError(400, "Chỉ xem được thời tiết trong 7 ngày tới");
  return day;
};

export const getWeatherRange = async (): Promise<WeatherDay[]> => [...(await load()).days.values()];

export const getCurrentWeather = async (): Promise<WeatherCurrent> => (await load()).current;
