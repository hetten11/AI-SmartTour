const weekdays = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

// Dịch cron 5 trường sang câu tiếng Việt cho dễ đọc. Không nhận ra thì trả lại
// nguyên biểu thức.
export const describeCron = (expression: string): string => {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return expression;
  const [minute, hour, day, month, weekday] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];

  const number = (value: string) => /^\d+$/.test(value);
  const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  const hourStep = hour.startsWith("*/") ? hour.slice(2) : null;
  const minuteStep = minute.startsWith("*/") ? minute.slice(2) : null;

  if (minute === "*" && hour === "*") return "Mỗi phút";
  if (minuteStep && hour === "*") return `Mỗi ${minuteStep} phút`;
  if (number(minute) && hour === "*") return `Mỗi giờ, phút thứ ${minute}`;
  if (hourStep && minute === "0") return `Mỗi ${hourStep} giờ`;

  if (number(minute) && number(hour)) {
    if (day === "*" && month === "*" && weekday === "*") return `Hằng ngày lúc ${time}`;
    if (day === "*" && month === "*" && number(weekday)) {
      const name = weekdays[Number(weekday) % 7] ?? `thứ ${weekday}`;
      return `${name} hằng tuần lúc ${time}`;
    }
    if (number(day) && month === "*" && weekday === "*") {
      return `Ngày ${day} hằng tháng lúc ${time}`;
    }
  }

  return expression;
};
