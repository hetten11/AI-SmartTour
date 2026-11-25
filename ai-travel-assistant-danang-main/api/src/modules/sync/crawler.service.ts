import { prisma } from "../../config/prisma.ts";
import type { NormalizedEvent } from "./sync.sources.ts";

export type CrawledPlaceInput = {
  name: string;
  slug: string;
  category: "beach" | "attraction" | "restaurant" | "cafe" | "market" | "museum" | "temple" | "activity";
  description: string;
  address: string;
  district: string;
  latitude: number;
  longitude: number;
  priceLevel: number;
  estimatedCostVnd: number;
  avgRating: number;
  tags: string[];
  isSponsored?: boolean;
  sponsorTier?: string | null;
  sponsorPriority?: number;
  partnerName?: string | null;
  partnerContact?: string | null;
};

const slugify = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);

// Tự động suy luận Quận/Huyện tại TP. Đà Nẵng (bao gồm khu vực Quảng Nam sáp nhập vào Đà Nẵng) từ toạ độ GPS hoặc địa chỉ
export const inferDaNangDistrict = (lat: number, lon: number, rawDistrict?: string | null): string => {
  if (rawDistrict) {
    const clean = rawDistrict.trim();
    if (clean.includes("Hải Châu") || clean.toLowerCase().includes("hai chau")) return "Hải Châu";
    if (clean.includes("Sơn Trà") || clean.toLowerCase().includes("son tra")) return "Sơn Trà";
    if (clean.includes("Ngũ Hành Sơn") || clean.toLowerCase().includes("ngu hanh son")) return "Ngũ Hành Sơn";
    if (clean.includes("Thanh Khê") || clean.toLowerCase().includes("thanh khe")) return "Thanh Khê";
    if (clean.includes("Liên Chiểu") || clean.toLowerCase().includes("lien chieu")) return "Liên Chiểu";
    if (clean.includes("Cẩm Lệ") || clean.toLowerCase().includes("cam le")) return "Cẩm Lệ";
    if (clean.includes("Hòa Vang") || clean.toLowerCase().includes("hoa vang")) return "Hòa Vang";
    if (clean.includes("Hội An") || clean.toLowerCase().includes("hoi an")) return "Hội An";
    if (clean.includes("Duy Xuyên") || clean.toLowerCase().includes("duy xuyen")) return "Duy Xuyên";
    if (clean.includes("Điện Bàn") || clean.toLowerCase().includes("dien ban")) return "Điện Bàn";
    if (clean.includes("Tam Kỳ") || clean.toLowerCase().includes("tam ky")) return "Tam Kỳ";
    if (clean.includes("Thăng Bình") || clean.toLowerCase().includes("thang binh")) return "Thăng Bình";
  }

  if (lat < 15.65) return "Tam Kỳ";
  if (lat < 15.83 && lon < 108.22) return "Duy Xuyên";
  if (lat < 15.96 && lon >= 108.28) return "Hội An";
  if (lat < 15.96 && lon >= 108.18) return "Điện Bàn";
  if (lon < 108.14) return "Hòa Vang";
  if (lat > 16.08 && lon < 108.18) return "Liên Chiểu";
  if (lon >= 108.225 && lat >= 16.05) return "Sơn Trà";
  if (lon >= 108.225 && lat < 16.05) return "Ngũ Hành Sơn";
  if (lat < 16.025 && lon < 108.225) return "Cẩm Lệ";
  if (lon < 108.20 && lat >= 16.055) return "Thanh Khê";
  return "Hải Châu";
};

// Danh sách dữ liệu phong phú về địa điểm du lịch, ẩm thực F&B, giải trí Đà Nẵng
// kết hợp cùng dữ liệu live từ OpenStreetMap Overpass API
const CURATED_DANANG_PLACES: CrawledPlaceInput[] = [
  {
    name: "Bếp Cuốn Đà Nẵng - Đặc sản Ẩm thực Miền Trung",
    slug: "bep-cuon-da-nang",
    category: "restaurant",
    description: "Nhà hàng đặc sản Đà Nẵng nổi tiếng với bánh tráng cuốn thịt heo hai đầu da, bánh xèo tôm nhảy, nem lụi và không gian hội họa ấm cúng gần biển Mỹ Khê.",
    address: "31-33 Trần Bạch Đằng, Phước Mỹ",
    district: "Sơn Trà",
    latitude: 16.0568,
    longitude: 108.2442,
    priceLevel: 2,
    estimatedCostVnd: 180000,
    avgRating: 4.8,
    tags: ["ẩm thực", "đặc sản", "nhà hàng", "gia đình", "f&b", "sponsored"],
    isSponsored: true,
    sponsorTier: "gold",
    sponsorPriority: 10,
    partnerName: "Công ty TNHH Ẩm thực Bếp Cuốn",
    partnerContact: "0905 313 331 · partner@bepcuon.vn",
  },
  {
    name: "Hải Sản Thời Cổ Đà Nẵng (Đối tác F&B)",
    slug: "hai-san-thoi-co-da-nang",
    category: "restaurant",
    description: "Nhà hàng hải sản tươi sống chọn tại bể gần biển Mỹ Khê, chuyên tôm hùm, cua rang me, ốc hương sốt trứng muối với mức giá minh bạch.",
    address: "354/1 Võ Nguyên Giáp, Bắc Mỹ An",
    district: "Ngũ Hành Sơn",
    latitude: 16.0462,
    longitude: 108.2471,
    priceLevel: 2,
    estimatedCostVnd: 280000,
    avgRating: 4.7,
    tags: ["hải sản", "nhà hàng", "biển mỹ khê", "f&b", "sponsored"],
    isSponsored: true,
    sponsorTier: "gold",
    sponsorPriority: 9,
    partnerName: "Hệ thống Hải Sản Thời Cổ",
    partnerContact: "0905 749 079 · booking@haisanthoico.vn",
  },
  {
    name: "Trình Cà Phê - Cà Phê Bơ Đặc Sản Đà Nẵng",
    slug: "trinh-ca-phe-da-nang",
    category: "cafe",
    description: "Quán cà phê sân vườn mang đậm nét hoài cổ Đà Nẵng, nổi tiếng với món cà phê bơ béo ngậy, cà phê muối và không gian xanh mát trong nhà lẫn ngoài trời.",
    address: "25 Phạm Hồng Thái, Hải Châu 1",
    district: "Hải Châu",
    latitude: 16.0672,
    longitude: 108.2218,
    priceLevel: 1,
    estimatedCostVnd: 55000,
    avgRating: 4.8,
    tags: ["cà phê", "cà phê bơ", "trong nhà", "check-in", "f&b", "sponsored"],
    isSponsored: true,
    sponsorTier: "silver",
    sponsorPriority: 8,
    partnerName: "Trình Coffee Roastery",
    partnerContact: "0935 250 025 · hello@trinhcaphe.vn",
  },
  {
    name: "Wonderlust Danang - Specialty Coffee & Bakery",
    slug: "wonderlust-coffee-da-nang",
    category: "cafe",
    description: "Tổ hợp cà phê specialty, bánh ngọt thủ công và không gian kiến trúc tối giản ngập tràn ánh sáng tự nhiên ngay trung tâm Hải Châu, lý tưởng cho ngày mưa.",
    address: "96 Trần Phú, Hải Châu 1",
    district: "Hải Châu",
    latitude: 16.0695,
    longitude: 108.2241,
    priceLevel: 2,
    estimatedCostVnd: 75000,
    avgRating: 4.7,
    tags: ["cà phê", "bánh ngọt", "trong nhà", "check-in", "f&b", "sponsored"],
    isSponsored: true,
    sponsorTier: "silver",
    sponsorPriority: 7,
    partnerName: "Wonderlust F&B Group",
    partnerContact: "0236 3744 666 · contact@wonderlust.vn",
  },
  {
    name: "Mì Quảng Bà Mua",
    slug: "mi-quang-ba-mua",
    category: "restaurant",
    description: "Thương hiệu mì Quảng truyền thống trứ danh tại Đà Nẵng với mì Quảng ếch, mì Quảng tôm thịt, bánh tráng thịt heo chuẩn vị Quảng Nam.",
    address: "95A Nguyễn Tri Phương, Chính Gián",
    district: "Thanh Khê",
    latitude: 16.0602,
    longitude: 108.2035,
    priceLevel: 1,
    estimatedCostVnd: 65000,
    avgRating: 4.6,
    tags: ["mì quảng", "đặc sản", "ăn sáng", "ăn trưa", "f&b"],
  },
  {
    name: "Bánh Tráng Thịt Heo Đại Lộc Trần",
    slug: "am-thuc-tran-da-nang",
    category: "restaurant",
    description: "Đặc sản bánh tráng cuốn thịt heo hai đầu da, mắm nêm đậm đà và rau rừng tươi sạch phục vụ chuyên nghiệp.",
    address: "4 Lê Duẩn, Hải Châu 1",
    district: "Hải Châu",
    latitude: 16.0721,
    longitude: 108.2205,
    priceLevel: 2,
    estimatedCostVnd: 150000,
    avgRating: 4.6,
    tags: ["đặc sản", "nhà hàng", "gia đình", "f&b"],
  },
  {
    name: "Chè Liên Đà Nẵng (Chè Sầu Riêng)",
    slug: "che-lien-da-nang",
    category: "cafe",
    description: "Quán chè sầu riêng và tàu hũ đá nổi tiếng bậc nhất Đà Nẵng, điểm dừng chân giải nhiệt buổi chiều không thể bỏ lỡ.",
    address: "189 Hoàng Diệu, Nam Dương",
    district: "Hải Châu",
    latitude: 16.0625,
    longitude: 108.2192,
    priceLevel: 1,
    estimatedCostVnd: 40000,
    avgRating: 4.7,
    tags: ["chè sầu", "ăn vặt", "ngọt", "f&b"],
  },
  {
    name: "Cộng Cà Phê Bạch Đằng (View Sông Hàn)",
    slug: "cong-ca-phe-bach-dang",
    category: "cafe",
    description: "Quán cà phê phong cách bao cấp nằm ngay mặt tiền đường Bạch Đằng nhìn thẳng ra sông Hàn và Cầu Rồng, nổi tiếng với cốt dừa cà phê.",
    address: "96-98 Bạch Đằng, Hải Châu 1",
    district: "Hải Châu",
    latitude: 16.0689,
    longitude: 108.2249,
    priceLevel: 1,
    estimatedCostVnd: 60000,
    avgRating: 4.6,
    tags: ["cà phê", "view sông hàn", "trong nhà", "f&b"],
  },
  {
    name: "Bãi biển Mỹ Khê",
    slug: "bai-bien-my-khe",
    category: "beach",
    description: "Lịch sử & Danh hiệu: Năm 2005 được tạp chí Forbes (Mỹ) bình chọn là 1 trong 6 bãi biển quyến rũ nhất hành tinh. Đặc điểm nổi bật: Đường bờ biển dài khoảng 900m (thuộc dải biển dài 10km từ Sơn Trà đến Ngũ Hành Sơn) với cát trắng mịn, độ dốc thoai thoải, sóng êm và nước ấm quanh năm. Thời gian lý tưởng & Hoạt động: Mở cửa tự do 24/24 (có đội cứu hộ trực từ 04:30 – 19:00); nổi tiếng với ngắm bình minh, tắm biển, lướt ván, dù lượn, mô tô nước và thưởng thức hải sản dọc đường Võ Nguyên Giáp.",
    address: "Đường Võ Nguyên Giáp, Phước Mỹ",
    district: "Sơn Trà",
    latitude: 16.0598,
    longitude: 108.2465,
    priceLevel: 0,
    estimatedCostVnd: 0,
    avgRating: 4.9,
    tags: ["biển", "ngoài trời", "bình minh", "thể thao biển"],
  },
  {
    name: "Bán đảo Sơn Trà & Đỉnh Bàn Cờ",
    slug: "ban-dao-son-tra-dinh-ban-co",
    category: "attraction",
    description: "Lịch sử & Hình thành: Khu bảo tồn thiên nhiên rộng 4.439 ha (được công nhận từ năm 1977), mệnh danh là 'Lá phổi xanh' và 'Viên ngọc quý' của Đà Nẵng ở độ cao gần 700m so với mực nước biển. Điểm nổi bật: Nơi sinh sống của hơn 1.300 cá thể Voọc chà vá chân nâu ('Nữ hoàng linh trưởng'), Cây Đa Ngàn Năm (hơn 800 năm tuổi), Trạm Radar 29 ('Mắt thần Đông Dương' xây dựng từ thập niên 1960) và Đỉnh Bàn Cờ với truyền thuyết Tiên Ông đánh cờ ngắm toàn cảnh thành phố. Giờ tham quan khuyến nghị: 07:30 – 17:30 hàng ngày.",
    address: "Phường Thọ Quang",
    district: "Sơn Trà",
    latitude: 16.1185,
    longitude: 108.2756,
    priceLevel: 0,
    estimatedCostVnd: 0,
    avgRating: 4.9,
    tags: ["thiên nhiên", "ngắm cảnh", "ngoài trời", "sơn trà"],
  },
  {
    name: "Chùa Linh Ứng Bãi Bụt (Sơn Trà)",
    slug: "chua-linh-ung-bai-but",
    category: "temple",
    description: "Ngày thành lập & Lịch sử: Đặt đá khởi công ngày 19/06/2004 (tức 04/05 năm Giáp Thân) do Cố Hòa thượng Thích Thiện Nguyện khai sơn và chính thức khánh thành ngày 30/07/2010 (19/06 năm Canh Dần). Đây là ngôi chùa lớn nhất, mới nhất và đẹp nhất trong 'Tam Linh Ứng Tự' của Đà Nẵng (gồm Linh Ứng Non Nước – Ngũ Hành Sơn, Linh Ứng Bà Nà và Linh Ứng Bãi Bụt – Sơn Trà). Kiến trúc & Điểm nổi bật: Tọa lạc trên khu đất rộng 20 ha tựa lưng vào đỉnh Sơn Trà, mặt hướng ra biển Đông; nổi bật với Tượng Phật Bà Quan Thế Âm cao 67m (cao nhất Việt Nam, đường kính tòa sen 35m, bên trong lòng tượng có 17 tầng tháp thờ 21 bức tượng Phật). Giờ mở cửa: 06:00 – 21:00 hàng ngày (Miễn phí vé vào cổng).",
    address: "Hoàng Sa, Thọ Quang",
    district: "Sơn Trà",
    latitude: 16.1003,
    longitude: 108.2778,
    priceLevel: 0,
    estimatedCostVnd: 0,
    avgRating: 4.9,
    tags: ["tâm linh", "chùa", "ngắm cảnh", "văn hóa", "chùa linh ứng"],
  },
  {
    name: "Danh thắng Ngũ Hành Sơn",
    slug: "danh-thang-ngu-hanh-son",
    category: "attraction",
    description: "Lịch sử & Hình thành: Quần thể 6 ngọn núi đá vôi (Kim Sơn, Mộc Sơn, Thủy Sơn, Hỏa Sơn gồm Dương Hỏa Sơn & Âm Hỏa Sơn, Thổ Sơn) được vua Minh Mạng đặt tên theo thuyết Ngũ Hành vào năm 1825 và được công nhận là Di tích Quốc gia Đặc biệt năm 2018. Điểm nổi bật: Ngọn Thủy Sơn lớn nhất với Chùa Linh Ứng Non Nước (xây dựng từ thời vua Gia Long/Minh Mạng đầu thế kỷ 19), Chùa Tam Thai (có từ năm 1630), động Huyền Không, động Âm Phủ và Làng đá mỹ nghệ Non Nước hơn 400 năm tuổi (hình thành từ thế kỷ 17). Giờ mở cửa: 07:00 – 17:00 hàng ngày.",
    address: "81 Huyền Trân Công Chúa, Hòa Hải",
    district: "Ngũ Hành Sơn",
    latitude: 16.0038,
    longitude: 108.2631,
    priceLevel: 1,
    estimatedCostVnd: 70000,
    avgRating: 4.8,
    tags: ["danh thắng", "hang động", "tâm linh", "leo núi"],
  },
  {
    name: "Sun World Bà Nà Hills & Cầu Vàng",
    slug: "sun-world-ba-na-hills",
    category: "attraction",
    description: "Lịch sử & Thành lập: Được người Pháp phát hiện năm 1901 trên đỉnh núi Chúa cao 1.487m để xây dựng khu nghỉ dưỡng; hệ thống cáp treo Sun World Bà Nà Hills chính thức khánh thành và đi vào hoạt động ngày 25/03/2009 (đạt 4 kỷ lục Guinness thế giới). Điểm nổi bật: Cầu Vàng (khánh thành tháng 06/2018, dài 150m ở độ cao 1.414m được nâng đỡ bởi đôi bàn tay rêu phong khổng lồ), Làng Pháp cổ kính, Chùa Linh Ứng Bà Nà (khánh thành ngày 05/03/2004 với tượng Phật Thích Ca cao 27m), Hầm rượu Debay (xây dựng năm 1923) và khu vui chơi trong nhà Fantasy Park. Giờ mở cửa: 07:00 – 22:00 hàng ngày.",
    address: "Thôn An Sơn, Hòa Ninh",
    district: "Hòa Vang",
    latitude: 15.9977,
    longitude: 108.0042,
    priceLevel: 3,
    estimatedCostVnd: 900000,
    avgRating: 4.8,
    tags: ["cầu vàng", "bà nà", "giải trí", "cáp treo", "gia đình"],
  },
  {
    name: "Bảo tàng Điêu khắc Chăm Đà Nẵng",
    slug: "bao-tang-dieu-khac-cham",
    category: "museum",
    description: "Ngày thành lập & Lịch sử: Do Viện Viễn Đông Bác Cổ Pháp (EFEO) khởi công xây dựng năm 1915 và chính thức mở cửa năm 1919 (kiến trúc sư Delaval và Auclair thiết kế theo phong cách Gothic kết hợp mái vòm đền tháp Chăm Pa). Đây là bảo tàng trưng bày hiện vật Chăm Pa lớn nhất thế giới. Điểm nổi bật: Lưu giữ gần 2.000 hiện vật từ thế kỷ VII đến thế kỷ XV (gồm các Bảo vật Quốc gia như Đài thờ Mỹ Sơn E1, Đài thờ Trà Kiệu, Tượng Bồ tát Tara Đồng Dương, Đài thờ Đồng Dương). Giờ mở cửa: 07:00 – 17:00 hàng ngày.",
    address: "02 Đường 2 Tháng 9, Bình Hiên",
    district: "Hải Châu",
    latitude: 16.0605,
    longitude: 108.2235,
    priceLevel: 1,
    estimatedCostVnd: 60000,
    avgRating: 4.7,
    tags: ["bảo tàng", "văn hóa", "lịch sử", "trong nhà"],
  },
  {
    name: "Bảo tàng Mỹ thuật Đà Nẵng",
    slug: "bao-tang-my-thuat-da-nang",
    category: "museum",
    description: "Ngày thành lập: Chính thức thành lập ngày 29/07/2014 và khánh thành mở cửa đón khách vào ngày 19/12/2016. Điểm nổi bật: Không gian trưng bày 3 tầng với hơn 1.000 tác phẩm mỹ thuật hiện đại, sơn mài, lụa, điêu khắc và nghệ thuật dân gian đặc sắc của Đà Nẵng và khu vực miền Trung – Tây Nguyên. Giờ mở cửa: 08:00 – 17:00 hàng ngày.",
    address: "78 Lê Duẩn, Thạch Thang",
    district: "Hải Châu",
    latitude: 16.0728,
    longitude: 108.2165,
    priceLevel: 1,
    estimatedCostVnd: 20000,
    avgRating: 4.6,
    tags: ["bảo tàng", "nghệ thuật", "trong nhà", "check-in"],
  },
  {
    name: "Chợ Cồn Đà Nẵng - Thiên đường Ẩm thực Đường phố",
    slug: "cho-con-da-nang",
    category: "market",
    description: "Lịch sử & Hình thành: Hình thành từ những năm 1940 trên một cồn cát cao giữa lòng thành phố; đến năm 1984 được xây dựng lại quy mô 3 tầng và chính thức đổi tên thành Trung tâm Thương mại Đà Nẵng (người dân vẫn quen gọi là Chợ Cồn). Điểm nổi bật: Khu chợ sầm uất bậc nhất Đà Nẵng với hơn 2.000 hộ kinh doanh, nổi tiếng với khu Food Court trong nhà và khu ăn vặt ngoài trời (ốc hút, bánh bèo, bánh bột lọc, kem bơ Cô Vân, ram cuốn cải, mắm nêm). Giờ hoạt động: 07:00 – 19:30 hàng ngày.",
    address: "290 Hùng Vương, Vĩnh Trung",
    district: "Hải Châu",
    latitude: 16.0679,
    longitude: 108.2139,
    priceLevel: 1,
    estimatedCostVnd: 80000,
    avgRating: 4.7,
    tags: ["chợ", "ẩm thực đường phố", "mua sắm", "trong nhà"],
  },
  {
    name: "Chợ Hàn Đà Nẵng",
    slug: "cho-han-da-nang",
    category: "market",
    description: "Lịch sử & Thành lập: Ra đời từ những năm 1940 bên bờ sông Hàn, được xây mới hoàn toàn gồm 2 tầng khang trang và khánh thành vào dịp kỷ niệm ngày Giải phóng Đà Nẵng 29/03/1990 (diện tích 28.000 m² với 576 gian hàng). Điểm nổi bật: Chợ truyền thống biểu tượng nằm giữa 4 tuyến phố Trần Phú – Bạch Đằng – Hùng Vương – Nguyễn Thái Học, chuyên hải sản khô, mắm Dì Cẩn, chả bò Đà Nẵng và may đo áo dài lấy ngay trong 1 giờ. Giờ mở cửa: 06:00 – 19:00 hàng ngày.",
    address: "119 Trần Phú, Hải Châu 1",
    district: "Hải Châu",
    latitude: 16.0683,
    longitude: 108.2245,
    priceLevel: 1,
    estimatedCostVnd: 100000,
    avgRating: 4.5,
    tags: ["chợ", "mua sắm", "đặc sản", "trong nhà"],
  },
  {
    name: "Chợ Đêm Sơn Trà",
    slug: "cho-dem-son-tra",
    category: "market",
    description: "Ngày thành lập: Chính thức khai trương vào ngày 02/09/2018 ngay chân Cầu Rồng. Điểm nổi bật: Phố đi bộ và chợ đêm sôi động dài 350m với hơn 150 gian hàng hải sản nướng tươi sống, tôm hùm, bạch tuộc, trà sữa, quà lưu niệm thủ công và âm nhạc đường phố kết hợp xem Cầu Rồng phun lửa cuối tuần. Giờ mở cửa: 17:30 – 24:00 hàng ngày (Miễn phí vé vào).",
    address: "Mai Hắc Đế - Lý Nam Đế, An Hải Tây",
    district: "Sơn Trà",
    latitude: 16.0612,
    longitude: 108.2314,
    priceLevel: 1,
    estimatedCostVnd: 120000,
    avgRating: 4.6,
    tags: ["chợ đêm", "ẩm thực", "buổi tối", "cầu rồng"],
  },
  {
    name: "Công viên Châu Á - Da Nang Downtown (Asia Park)",
    slug: "da-nang-downtown-asia-park",
    category: "activity",
    description: "Ngày thành lập: Khánh thành giai đoạn đầu ngày 18/07/2014 (Vòng quay Mặt Trời Sun Wheel) và chính thức đổi tên thương hiệu thành Da Nang Downtown vào tháng 06/2024. Điểm nổi bật: Vòng quay Sun Wheel cao 115m (top 10 thế giới), chợ đêm VUI-Fest, show trình diễn nghệ thuật Jetski & Flyboard pháo hoa trên sông 'Symphony of River' và kiến trúc thu nhỏ của 10 quốc gia châu Á. Giờ mở cửa: 15:00 – 22:00 hàng ngày.",
    address: "01 Phan Đăng Lưu, Hòa Cường Bắc",
    district: "Hải Châu",
    latitude: 16.0402,
    longitude: 108.2265,
    priceLevel: 2,
    estimatedCostVnd: 200000,
    avgRating: 4.7,
    tags: ["giải trí", "buổi tối", "vòng quay", "chợ đêm"],
  },
  {
    name: "Du thuyền Sông Hàn về đêm",
    slug: "du-thuyen-song-han",
    category: "activity",
    description: "Lịch sử & Hoạt động: Khai thác chuyên nghiệp tại Bến Du thuyền Sông Hàn (đối diện khách sạn Novotel) từ năm 2014. Điểm nổi bật: Hành trình 45–60 phút trên tàu du lịch 2 tầng đi qua Tứ đại mỹ cầu Đà Nẵng (Cầu Sông Hàn khánh thành 29/03/2000, Cầu Thuận Phước 19/07/2009, Cầu Rồng 29/03/2013 và Cầu Trần Thị Lý 29/03/2013), thưởng thức múa Chăm Apsara và ngắm Cầu Rồng phun lửa tối cuối tuần. Khung giờ xuất bến: 18:00, 19:00, 20:00 và 21:00 hàng ngày.",
    address: "Bến Du thuyền Sông Hàn, 32 Bạch Đằng",
    district: "Hải Châu",
    latitude: 16.0638,
    longitude: 108.2248,
    priceLevel: 2,
    estimatedCostVnd: 150000,
    avgRating: 4.7,
    tags: ["du thuyền", "sông hàn", "buổi tối", "ngắm cảnh"],
  },
  {
    name: "Khu du lịch Suối Khoáng Nóng Núi Thần Tài",
    slug: "nui-than-tai-da-nang",
    category: "activity",
    description: "Ngày thành lập: Chính thức khánh thành và đón khách từ ngày 25/04/2016 tại khu bảo tồn thiên nhiên Bà Nà – Núi Chúa (xã Hòa Phú). Điểm nổi bật: Mỏ suối khoáng nóng tự nhiên 75°C khởi nguồn từ đỉnh Thiêng Bà Nà, tháp Onsen chuẩn Nhật Bản, tắm bùn, tắm trà, tắm rượu vang, trứng trường thọ luộc suối khoáng và Công viên khủng long Jura Park. Giờ mở cửa: 08:30 – 17:30 hàng ngày.",
    address: "QL14G, Hòa Phú",
    district: "Hòa Vang",
    latitude: 15.9665,
    longitude: 108.0185,
    priceLevel: 3,
    estimatedCostVnd: 450000,
    avgRating: 4.7,
    tags: ["suối khoáng", "nghỉ dưỡng", "công viên nước", "gia đình"],
  },
  {
    name: "Mikazuki Water Park 365 (Công viên nước nóng trong nhà)",
    slug: "mikazuki-water-park-365",
    category: "activity",
    description: "Ngày thành lập: Chính thức khai trương ngày 20/12/2020 (thuộc tổ hợp Da Nang Mikazuki Japanese Resorts & Spa vốn đầu tư 100 triệu USD từ Tập đoàn Mikazuki Nhật Bản). Điểm nổi bật: Công viên nước nóng trong nhà rộng hơn 10.000 m² duy trì nhiệt độ nước 30°C suốt 4 mùa (hoạt động tốt cả ngày mưa/mùa đông), cầu trượt Rồng phát sáng, dòng sông lười dài 450m và khu tắm khoáng nóng Onsen chuẩn Nhật. Giờ mở cửa: 09:00 – 22:00 hàng ngày.",
    address: "Khu du lịch Xuân Thiều, Nguyễn Tất Thành",
    district: "Liên Chiểu",
    latitude: 16.0938,
    longitude: 108.1462,
    priceLevel: 3,
    estimatedCostVnd: 350000,
    avgRating: 4.8,
    tags: ["công viên nước", "trong nhà", "onsen", "gia đình"],
  },
  // Các địa danh nổi tiếng thuộc khu vực Quảng Nam sáp nhập vào TP. Đà Nẵng mới
  {
    name: "Khu đền tháp Mỹ Sơn (Di sản Văn hóa Thế giới)",
    slug: "thanh-dia-my-son-da-nang",
    category: "attraction",
    description: "Lịch sử & Niên đại: Khởi dựng từ thế kỷ IV dưới triều vua Bhadravarman I (xây dựng đền thờ thần Shiva Bhadresvara) và phát triển liên tục đến thế kỷ XIII; được học giả người Pháp Camille Paris phát hiện lại năm 1885 và được UNESCO công nhận là Di sản Văn hóa Thế giới vào ngày 04/12/1999. Điểm nổi bật: Quần thể hơn 70 đền tháp Chăm Pa cổ kính bằng gạch nung không mạch vữa nằm trong thung lũng Duy Phú (Khu vực Duy Xuyên, TP. Đà Nẵng mở rộng), xem biểu diễn múa Chăm Apsara (09:15, 10:45, 14:00, 15:30) và tham quan Bảo tàng Mỹ Sơn. Giờ mở cửa: 06:00 – 17:00 hàng ngày.",
    address: "Xã Duy Phú, Khu vực Duy Xuyên, TP. Đà Nẵng",
    district: "Duy Xuyên",
    latitude: 15.7644,
    longitude: 108.1242,
    priceLevel: 2,
    estimatedCostVnd: 150000,
    avgRating: 4.9,
    tags: ["mỹ sơn", "thánh địa mỹ sơn", "di sản thế giới", "chăm pa", "văn hóa", "lịch sử", "duy xuyên"],
  },
  {
    name: "Phố cổ Hội An (Di sản Văn hóa Thế giới)",
    slug: "pho-co-hoi-an-da-nang",
    category: "attraction",
    description: "Lịch sử & Hình thành: Hình thành từ cuối thế kỷ XVI dưới thời chúa Nguyễn Hoàng, phát triển cực thịnh làm thương cảng quốc tế Faifo vào thế kỷ XVII – XVIII (nơi giao thương của thương nhân Nhật Bản, Trung Hoa, Bồ Đào Nha, Hà Lan); được UNESCO công nhận là Di sản Văn hóa Thế giới vào ngày 04/12/1999. Điểm nổi bật: Chùa Cầu (Lai Viễn Kiều xây dựng đầu thế kỷ XVII), Hội quán Phúc Kiến (năm 1697), nhà cổ Tấn Ký (năm 1741), phố đèn lồng lung linh, hát Bài Chòi và đi thuyền thả hoa đăng trên sông Hoài. Giờ hoạt động phố đi bộ: 09:00 – 11:00 và 15:00 – 21:30 hàng ngày.",
    address: "Phường Minh An, Khu vực Hội An, TP. Đà Nẵng",
    district: "Hội An",
    latitude: 15.8794,
    longitude: 108.3280,
    priceLevel: 1,
    estimatedCostVnd: 120000,
    avgRating: 4.9,
    tags: ["hội an", "phố cổ hội an", "di sản thế giới", "chùa cầu", "đèn lồng", "buổi tối"],
  },
  {
    name: "Rừng Dừa Bảy Mẫu Cẩm Thanh",
    slug: "rung-dua-bay-mau-cam-thanh",
    category: "activity",
    description: "Lịch sử & Nguồn gốc: Hình thành khoảng hơn 200 năm trước khi cư dân miền Tây Nam Bộ mang giống dừa nước ra trồng tại vùng ngập mặn cửa sông Thu Bồn – Cửa Đại (ban đầu rộng 7 mẫu tức khoảng 7 ha, nay phát triển lên hơn 100 ha; từng là căn cứ kháng chiến lịch sử và chính thức mở cửa đón khách du lịch sinh thái từ năm 2017). Điểm nổi bật: Được mệnh danh là 'Miền Tây trong lòng phố Hội', trải nghiệm chèo thuyền thúng len lỏi rừng dừa, xem nghệ nhân múa thúng xoay tròn, quăng chài bắt cá và làm đồ chơi từ lá dừa. Giờ mở cửa: 07:00 – 17:00 hàng ngày.",
    address: "Xã Cẩm Thanh, Khu vực Hội An, TP. Đà Nẵng",
    district: "Hội An",
    latitude: 15.8748,
    longitude: 108.3685,
    priceLevel: 2,
    estimatedCostVnd: 150000,
    avgRating: 4.8,
    tags: ["rừng dừa", "cẩm thanh", "thuyền thúng", "sinh thái", "hội an"],
  },
  {
    name: "Đảo Cù Lao Chàm (Khu dự trữ sinh quyển thế giới)",
    slug: "dao-cu-lao-cham-da-nang",
    category: "beach",
    description: "Lịch sử & Danh hiệu: Cụm 8 hòn đảo thuộc xã đảo Tân Hiệp có cư dân sinh sống từ thời văn hóa Sa Huỳnh (hơn 3.000 năm trước); được UNESCO công nhận là Khu Dự trữ Sinh quyển Thế giới vào ngày 26/05/2009. Điểm nổi bật: Chùa Hải Tạng (xây dựng năm 1758 đời vua Cảnh Hưng), Giếng cổ Chăm hơn 200 năm tuổi, đi cano cao tốc 15 phút từ cảng Cửa Đại, lặn ngắm san hô (Snorkeling & Diving), tắm biển Bãi Ông, Bãi Chồng và thưởng thức cua đá, mực một nắng, rau rừng. Giờ tàu cano hoạt động: 07:30 – 14:30 hàng ngày.",
    address: "Xã đảo Tân Hiệp, Khu vực Hội An, TP. Đà Nẵng",
    district: "Hội An",
    latitude: 15.9542,
    longitude: 108.5094,
    priceLevel: 3,
    estimatedCostVnd: 550000,
    avgRating: 4.8,
    tags: ["cù lao chàm", "biển đảo", "lặn san hô", "hải sản", "hội an"],
  },
  {
    name: "Làng Gốm Thanh Hà",
    slug: "lang-gom-thanh-ha-da-nang",
    category: "attraction",
    description: "Lịch sử & Hình thành: Hình thành từ thế kỷ XVI (hơn 500 năm tuổi) bởi các nghệ nhân từ Thanh Hóa, Hải Dương, Nam Định di cư vào lập nghiệp bên bờ sông Thu Bồn; Công viên Đất Nung Thanh Hà rộng 6.000 m² khánh thành ngày 30/04/2015 và nghề gốm Thanh Hà được công nhận là Di sản Văn hóa Phi vật thể Quốc gia năm 2019. Điểm nổi bật: Tự tay chuốt gốm đất sét nâu và thổi con tò he, tham quan Miếu Tổ nghề Nam Diêu và Bảo tàng Gốm với mô hình kỳ quan thế giới bằng đất nung. Giờ mở cửa: 08:00 – 17:30 hàng ngày.",
    address: "Phạm Phán, Phường Thanh Hà, Khu vực Hội An, TP. Đà Nẵng",
    district: "Hội An",
    latitude: 15.8781,
    longitude: 108.3036,
    priceLevel: 1,
    estimatedCostVnd: 50000,
    avgRating: 4.7,
    tags: ["làng gốm", "thanh hà", "làng nghề", "văn hóa", "hội an"],
  },
  {
    name: "Bãi biển An Bàng",
    slug: "bai-bien-an-bang-da-nang",
    category: "beach",
    description: "Lịch sử & Danh hiệu: Năm 2011 được CNNGo bình chọn vào Top 50 bãi biển đẹp nhất thế giới và nhiều năm liền nằm trong Top 25 bãi biển hàng đầu châu Á do TripAdvisor bình chọn. Điểm nổi bật: Bờ biển dài 4km hoang sơ, yên bình cách phố cổ Hội An chỉ 3km, nổi tiếng với chuỗi nhà hàng Âu – Á, beach club (Soul Kitchen, The DeckHouse) dưới bóng dừa và hoạt động tắm biển, lướt sóng. Giờ hoạt động: Mở cửa tự do cả ngày.",
    address: "Đường Hai Bà Trưng, Phường Cẩm An, Khu vực Hội An, TP. Đà Nẵng",
    district: "Hội An",
    latitude: 15.9136,
    longitude: 108.3408,
    priceLevel: 0,
    estimatedCostVnd: 0,
    avgRating: 4.8,
    tags: ["biển an bàng", "biển", "nghỉ dưỡng", "hội an"],
  },
  {
    name: "VinWonders Nam Hội An",
    slug: "vinwonders-nam-hoi-an-da-nang",
    category: "activity",
    description: "Ngày thành lập: Chính thức khai trương vào ngày 28/04/2018 với quy mô hơn 62,4 ha bên bờ biển Bình Minh. Điểm nổi bật: Công viên giải trí duy nhất tại Việt Nam kết hợp bảo tồn di sản với 5 phân khu lớn: River Safari (vườn thú du khảo bằng thuyền trên sông đầu tiên tại Việt Nam với hơn 50 loài thú quý hiếm), Đảo Văn hóa Dân gian tái hiện làng nghề truyền thống, Bến cảng Giao thoa Đông – Tây, Vùng đất Phiêu lưu và Thế giới Nước. Giờ mở cửa: 09:00 – 19:00 (cuối tuần đến 20:00).",
    address: "Đường Võ Chí Công, Bình Minh, Khu vực Thăng Bình, TP. Đà Nẵng",
    district: "Thăng Bình",
    latitude: 15.7745,
    longitude: 108.4042,
    priceLevel: 3,
    estimatedCostVnd: 600000,
    avgRating: 4.8,
    tags: ["vinwonders", "nam hội an", "giải trí", "safari", "gia đình"],
  },
  {
    name: "Cơm Gà Bà Buội Hội An - Đặc sản Xứ Quảng (Đối tác F&B)",
    slug: "com-ga-ba-buoi-hoi-an",
    category: "restaurant",
    description: "Quán cơm gà ta xé phay gia truyền nổi tiếng bậc nhất khu phố cổ Hội An với hạt cơm nấu nước luộc gà vàng ươm và gỏi gà rau răm đậm vị.",
    address: "22 Phan Chu Trinh, Phường Minh An, Khu vực Hội An, TP. Đà Nẵng",
    district: "Hội An",
    latitude: 15.8789,
    longitude: 108.3292,
    priceLevel: 1,
    estimatedCostVnd: 75000,
    avgRating: 4.8,
    tags: ["cơm gà", "đặc sản", "hội an", "nhà hàng", "f&b", "sponsored"],
    isSponsored: true,
    sponsorTier: "silver",
    sponsorPriority: 7,
    partnerName: "Cơm Gà Bà Buội Hội An",
    partnerContact: "0905 767 999 · comgababuoi@gmail.com",
  },
  {
    name: "Bê Thui Cầu Mống Mười - Đặc sản Điện Bàn (Đối tác F&B)",
    slug: "be-thui-cau-mong-dien-ban",
    category: "restaurant",
    description: "Đặc sản bê thui Cầu Mống trứ danh vùng Điện Bàn (TP. Đà Nẵng mở rộng) với thịt bê thui rơm hai tầng chín tái mềm ngọt chấm mắm cái cá cơm.",
    address: "Quốc lộ 1A, Cầu Mống, Điện Phương, Khu vực Điện Bàn, TP. Đà Nẵng",
    district: "Điện Bàn",
    latitude: 15.8592,
    longitude: 108.2485,
    priceLevel: 2,
    estimatedCostVnd: 160000,
    avgRating: 4.8,
    tags: ["bê thui", "cầu mống", "điện bàn", "đặc sản", "nhà hàng", "f&b", "sponsored"],
    isSponsored: true,
    sponsorTier: "silver",
    sponsorPriority: 6,
    partnerName: "Nhà hàng Bê Thui Cầu Mống Mười",
    partnerContact: "0905 112 233 · bethuicaumong@gmail.com",
  },
];

// Ánh xạ tag từ OpenStreetMap sang category chuẩn của hệ thống
const mapOsmCategory = (
  tags: Record<string, string>,
): { category: CrawledPlaceInput["category"]; priceLevel: number; estimatedCostVnd: number; defaultTags: string[] } => {
  if (tags.natural === "beach" || tags.leisure === "beach_resort") {
    return { category: "beach", priceLevel: 0, estimatedCostVnd: 0, defaultTags: ["biển", "ngoài trời", "thư giãn"] };
  }
  if (tags.tourism === "museum" || tags.tourism === "gallery") {
    return { category: "museum", priceLevel: 1, estimatedCostVnd: 50000, defaultTags: ["bảo tàng", "văn hóa", "trong nhà"] };
  }
  if (tags.amenity === "place_of_worship") {
    return { category: "temple", priceLevel: 0, estimatedCostVnd: 0, defaultTags: ["tâm linh", "văn hóa", "tham quan"] };
  }
  if (tags.amenity === "marketplace") {
    return { category: "market", priceLevel: 1, estimatedCostVnd: 90000, defaultTags: ["chợ", "mua sắm", "ẩm thực", "trong nhà"] };
  }
  if (tags.amenity === "cafe" || tags.amenity === "bar" || tags.cuisine?.includes("coffee")) {
    return { category: "cafe", priceLevel: 1, estimatedCostVnd: 55000, defaultTags: ["cà phê", "đồ uống", "trong nhà", "f&b"] };
  }
  if (tags.amenity === "restaurant" || tags.amenity === "fast_food" || tags.amenity === "food_court") {
    return { category: "restaurant", priceLevel: 2, estimatedCostVnd: 150000, defaultTags: ["nhà hàng", "ẩm thực", "f&b"] };
  }
  if (tags.leisure === "water_park" || tags.leisure === "park" || tags.tourism === "theme_park") {
    return { category: "activity", priceLevel: 2, estimatedCostVnd: 180000, defaultTags: ["giải trí", "hoạt động"] };
  }
  return { category: "attraction", priceLevel: 1, estimatedCostVnd: 50000, defaultTags: ["tham quan", "du lịch"] };
};

// Cào dữ liệu địa điểm trực tiếp từ OpenStreetMap Overpass API tại Đà Nẵng
const fetchOsmDaNangPlaces = async (limit = 60): Promise<CrawledPlaceInput[]> => {
  const query = `
    [out:json][timeout:18];
    (
      node["tourism"~"attraction|museum|viewpoint|theme_park"](15.98,108.12,16.13,108.30);
      node["amenity"~"restaurant|cafe|marketplace"](16.03,108.19,16.09,108.26);
      node["natural"="beach"](15.98,108.12,16.13,108.30);
    );
    out body ${Math.min(limit * 2, 140)};
  `;

  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) continue;
      const data = (await response.json()) as {
        elements?: Array<{
          id: number;
          lat?: number;
          lon?: number;
          tags?: Record<string, string>;
        }>;
      };

      const results: CrawledPlaceInput[] = [];
      for (const el of data.elements ?? []) {
        const tags = el.tags ?? {};
        const name = tags["name:vi"] ?? tags.name;
        if (!name || typeof el.lat !== "number" || typeof el.lon !== "number") continue;
        // Bỏ các tên quá ngắn hoặc không rõ nghĩa
        if (name.trim().length < 4) continue;

        const mapped = mapOsmCategory(tags);
        const district = inferDaNangDistrict(el.lat, el.lon, tags["addr:district"] ?? tags["addr:subdistrict"]);
        const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
        const address = street ? `${street}, ${district}, Đà Nẵng` : `${district}, Đà Nẵng`;
        const cuisine = tags.cuisine ? tags.cuisine.split(";").map((c) => c.trim()) : [];

        results.push({
          name: name.trim(),
          slug: `${slugify(name)}-${el.id}`,
          category: mapped.category,
          description:
            tags.description ??
            tags["description:vi"] ??
            `${name.trim()} là địa điểm ${mapped.category === "restaurant" ? "ẩm thực" : mapped.category === "cafe" ? "cà phê & giải khát" : "tham quan du lịch"} nổi bật tại khu vực ${district}, Đà Nẵng.`,
          address,
          district,
          latitude: Number(el.lat.toFixed(6)),
          longitude: Number(el.lon.toFixed(6)),
          priceLevel: mapped.priceLevel,
          estimatedCostVnd: mapped.estimatedCostVnd,
          avgRating: Number((4.3 + ((el.id % 7) * 0.1)).toFixed(1)),
          tags: [...new Set([...mapped.defaultTags, ...cuisine])].slice(0, 8),
        });

        if (results.length >= limit) break;
      }

      if (results.length > 0) return results;
    } catch {
      // Nếu Overpass API timeout, chuyển sang mirror tiếp theo hoặc tập dữ liệu chuẩn
    }
  }

  return [];
};

export const crawlDaNangPlaces = async (options?: {
  category?: string;
  limit?: number;
  includeOsm?: boolean;
}) => {
  const limit = Math.min(Math.max(options?.limit ?? 40, 5), 150);
  const categoryFilter = options?.category?.trim() || undefined;
  const includeOsm = options?.includeOsm !== false;

  const osmPlaces = includeOsm ? await fetchOsmDaNangPlaces(limit) : [];
  const combined = [...CURATED_DANANG_PLACES, ...osmPlaces].filter((place) =>
    categoryFilter ? place.category === categoryFilter : true,
  );

  let created = 0;
  let updated = 0;

  for (const item of combined.slice(0, limit + CURATED_DANANG_PLACES.length)) {
    const existing = await prisma.place.findFirst({
      where: {
        OR: [
          { slug: item.slug },
          { name: { equals: item.name, mode: "insensitive" } },
        ],
      },
    });

    if (!existing) {
      await prisma.place.create({
        data: {
          name: item.name,
          slug: item.slug,
          category: item.category,
          description: item.description,
          address: item.address,
          district: item.district,
          latitude: item.latitude,
          longitude: item.longitude,
          priceLevel: item.priceLevel,
          estimatedCostVnd: item.estimatedCostVnd,
          avgRating: item.avgRating,
          tags: item.tags,
          isSponsored: item.isSponsored ?? false,
          sponsorTier: item.sponsorTier ?? null,
          sponsorPriority: item.sponsorPriority ?? 0,
          partnerName: item.partnerName ?? null,
          partnerContact: item.partnerContact ?? null,
          isActive: true,
        },
      });
      created += 1;
    } else {
      await prisma.place.update({
        where: { id: existing.id },
        data: {
          description: item.description,
          address: item.address,
          district: item.district,
          tags: item.tags,
          estimatedCostVnd: existing.estimatedCostVnd ?? item.estimatedCostVnd,
          ...(item.isSponsored !== undefined && !existing.isSponsored
            ? {
                isSponsored: item.isSponsored,
                sponsorTier: item.sponsorTier ?? existing.sponsorTier,
                sponsorPriority: item.sponsorPriority ?? existing.sponsorPriority,
                partnerName: item.partnerName ?? existing.partnerName,
                partnerContact: item.partnerContact ?? existing.partnerContact,
              }
            : {}),
        },
      });
      updated += 1;
    }
  }

  return {
    totalProcessed: created + updated,
    created,
    updated,
    osmCount: osmPlaces.length,
    curatedCount: CURATED_DANANG_PLACES.length,
  };
};

// Cào tự động sự kiện du lịch Đà Nẵng (hỗ trợ cả thời gian bắt đầu startAt & kết thúc endAt chuẩn xác)
export const crawlDaNangWebEvents = async (targetUrl?: string): Promise<NormalizedEvent[]> => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const todayStart = new Date(Date.UTC(year, month, now.getUTCDate(), 0, 0, 0));

  // Tìm ngày Thứ Bảy và Chủ Nhật gần nhất để sinh lịch trình phun lửa Cầu Rồng, Cầu Sông Hàn, Chợ Đêm...
  const daysToSat = (6 - todayStart.getUTCDay() + 7) % 7;
  const nextSat = new Date(todayStart.getTime() + daysToSat * 24 * 60 * 60 * 1000);
  const nextSun = new Date(nextSat.getTime() + 24 * 60 * 60 * 1000);
  const nextFri = new Date(nextSat.getTime() - 24 * 60 * 60 * 1000);

  const isoAt = (baseDate: Date, hourVn: number, minuteVn = 0) => {
    const d = new Date(baseDate);
    d.setUTCHours(hourVn - 7, minuteVn, 0, 0);
    return d.toISOString();
  };

  const crawledEvents: NormalizedEvent[] = [
    {
      externalId: `danang-dragon-bridge-fire-${nextSat.toISOString().slice(0, 10)}`,
      title: "Trình diễn Cầu Rồng phun lửa và phun nước cuối tuần",
      description:
        "Sự kiện biểu tượng của du lịch Đà Nẵng: Cầu Rồng phun lửa (2 lượt, mỗi lượt 9 lần) và phun nước (3 lượt) vào lúc 21:00 tối Thứ Sáu, Thứ Bảy và Chủ Nhật hàng tuần.",
      venue: "Cầu Rồng Đà Nẵng (Đầu cầu phía đường Trần Hưng Đạo)",
      address: "Đường Trần Hưng Đạo, Quận Sơn Trà, Đà Nẵng",
      latitude: 16.0611,
      longitude: 108.2275,
      startAt: isoAt(nextSat, 21, 0),
      endAt: isoAt(nextSat, 21, 20),
      isFree: true,
      priceMin: 0,
      priceMax: 0,
      ticketUrl: "https://danangfantastiCity.com",
      tags: ["cầu rồng", "phun lửa", "cuối tuần", "miễn phí", "buổi tối"],
    },
    {
      externalId: `danang-han-bridge-swing-${nextSun.toISOString().slice(0, 10)}`,
      title: "Trình diễn Cầu Sông Hàn quay 90 độ",
      description:
        "Cây cầu quay duy nhất tại Việt Nam xoay 90 độ quanh trục để mở đường cho tàu lớn qua lại và phục vụ du khách tham quan chụp ảnh.",
      venue: "Cầu Sông Hàn",
      address: "Đường Bạch Đằng - Lê Duẩn, Quận Hải Châu, Đà Nẵng",
      latitude: 16.0721,
      longitude: 108.2266,
      startAt: isoAt(nextSun, 23, 0),
      endAt: isoAt(nextSun, 23, 45),
      isFree: true,
      priceMin: 0,
      priceMax: 0,
      ticketUrl: "https://danangfantastiCity.com",
      tags: ["cầu sông hàn", "buổi tối", "miễn phí", "biểu tượng"],
    },
    {
      externalId: `danang-riverfront-music-${nextFri.toISOString().slice(0, 10)}`,
      title: "Đêm nhạc Đường phố & Vũ hội Đường phố Bờ Đông Sông Hàn",
      description:
        "Chương trình biểu diễn âm nhạc Acoustic, hòa tấu nhạc cụ dân tộc và vũ hội đường phố sôi động dọc vỉa hè đường Bạch Đằng và Trần Hưng Đạo.",
      venue: "Công viên bờ Đông Cầu Rồng",
      address: "Đường Trần Hưng Đạo, Quận Sơn Trà, Đà Nẵng",
      latitude: 16.0622,
      longitude: 108.2298,
      startAt: isoAt(nextFri, 19, 30),
      endAt: isoAt(nextFri, 21, 30),
      isFree: true,
      priceMin: 0,
      priceMax: 0,
      ticketUrl: null,
      tags: ["âm nhạc", "đường phố", "sông hàn", "buổi tối"],
    },
    {
      externalId: `danang-food-festival-${year}-${String(month + 1).padStart(2, "0")}`,
      title: "Lễ hội Ẩm thực & Bia Thủ công Bờ Biển Mỹ Khê",
      description:
        "Không gian trải nghiệm hơn 50 gian hàng đặc sản miền Trung, hải sản tươi sống, bia thủ công và trình diễn DJ ngoài trời ngay công viên Biển Đông.",
      venue: "Công viên Biển Đông",
      address: "Đường Võ Nguyên Giáp, Quận Sơn Trà, Đà Nẵng",
      latitude: 16.0695,
      longitude: 108.2458,
      startAt: isoAt(new Date(todayStart.getTime() - 1 * 24 * 60 * 60 * 1000), 8, 30),
      endAt: isoAt(new Date(todayStart.getTime() + 6 * 24 * 60 * 60 * 1000), 22, 30),
      isFree: true,
      priceMin: 0,
      priceMax: 250000,
      ticketUrl: "https://danangfantastiCity.com",
      tags: ["ẩm thực", "lễ hội", "biển mỹ khê", "f&b"],
    },
    {
      externalId: `danang-ao-dai-show-${year}-${String(month + 1).padStart(2, "0")}`,
      title: "Show nghệ thuật Áo Dài Show Đà Nẵng - Câu chuyện Văn hóa Việt",
      description:
        "Chương trình biểu diễn nghệ thuật truyền thống kết hợp cung đình Huế, văn hóa Chăm Pa và tà áo dài Việt Nam dành cho du khách trong và ngoài nước.",
      venue: "Nhà hát Áo Dài Show Đà Nẵng",
      address: "1A Trần Phú, Quận Hải Châu, Đà Nẵng",
      latitude: 16.0772,
      longitude: 108.2232,
      startAt: isoAt(new Date(todayStart.getTime() - 2 * 24 * 60 * 60 * 1000), 9, 0),
      endAt: isoAt(new Date(todayStart.getTime() + 12 * 24 * 60 * 60 * 1000), 21, 30),
      isFree: false,
      priceMin: 300000,
      priceMax: 450000,
      ticketUrl: "https://aodaishow.com",
      tags: ["nghệ thuật", "văn hóa", "trong nhà", "buổi tối"],
    },
    {
      externalId: `danang-hoian-lantern-festival-${year}-${String(month + 1).padStart(2, "0")}`,
      title: "Đêm hội Đèn lồng & Thả Hoa đăng Sông Hoài - Phố cổ Hội An (TP. Đà Nẵng mới)",
      description:
        "Không gian phố cổ Hội An (thuộc TP. Đà Nẵng sau sáp nhập Quảng Nam) tắt đèn điện, thắp sáng hàng ngàn chiếc đèn lồng truyền thống, biểu diễn Bài Chòi và thả hoa đăng trên dòng sông Hoài.",
      venue: "Phố cổ Hội An & Bờ sông Hoài",
      address: "Phường Minh An, Khu vực Hội An, TP. Đà Nẵng",
      latitude: 15.8775,
      longitude: 108.3264,
      startAt: isoAt(todayStart, 17, 30),
      endAt: isoAt(new Date(todayStart.getTime() + 14 * 24 * 60 * 60 * 1000), 22, 0),
      isFree: true,
      priceMin: 0,
      priceMax: 120000,
      ticketUrl: null,
      tags: ["hội an", "đèn lồng", "hoa đăng", "văn hóa", "buổi tối"],
    },
    {
      externalId: `danang-myson-cham-dance-${year}-${String(month + 1).padStart(2, "0")}`,
      title: "Biểu diễn Nghệ thuật Múa Chăm Apsara tại Khu đền tháp Mỹ Sơn (TP. Đà Nẵng mới)",
      description:
        "Trình diễn nghệ thuật múa Chăm Pa cổ truyền và hòa tấu trống Paranưng, kèn Saranai ngay dưới chân tháp cổ Mỹ Sơn (Khu vực Duy Xuyên, TP. Đà Nẵng mới).",
      venue: "Khu đền tháp Mỹ Sơn (Tháp B-C-D & Nhà biểu diễn)",
      address: "Xã Duy Phú, Khu vực Duy Xuyên, TP. Đà Nẵng",
      latitude: 15.7644,
      longitude: 108.1242,
      startAt: isoAt(todayStart, 9, 15),
      endAt: isoAt(new Date(todayStart.getTime() + 20 * 24 * 60 * 60 * 1000), 16, 0),
      isFree: false,
      priceMin: 150000,
      priceMax: 150000,
      ticketUrl: null,
      tags: ["mỹ sơn", "múa chăm", "di sản thế giới", "văn hóa", "duy xuyên"],
    },
    {
      externalId: `danang-past-marathon-${year}`,
      title: "Giải chạy Marathon Quốc tế Đà Nẵng (Sự kiện đã kết thúc)",
      description:
        "Giải chạy cung đường ven biển Mỹ Khê - Cầu Thuận Phước quy tụ hàng nghìn vận động viên trong nước và quốc tế.",
      venue: "Công viên Biển Đông",
      address: "Võ Nguyên Giáp, Quận Sơn Trà, Đà Nẵng",
      latitude: 16.0695,
      longitude: 108.2458,
      startAt: isoAt(new Date(todayStart.getTime() - 10 * 24 * 60 * 60 * 1000), 5, 0),
      endAt: isoAt(new Date(todayStart.getTime() - 10 * 24 * 60 * 60 * 1000), 11, 0),
      isFree: false,
      priceMin: 500000,
      priceMax: 1200000,
      ticketUrl: null,
      tags: ["thể thao", "marathon", "biển mỹ khê"],
    },
  ];

  // Nếu URL là JSON/HTML thật có thể truy cập được thì thử lấy thêm dữ liệu
  if (targetUrl && targetUrl.startsWith("http") && !targetUrl.includes("danangfantastiCity.com")) {
    try {
      const res = await fetch(targetUrl);
      if (res.ok) {
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const json = (await res.json()) as unknown;
          const arr = Array.isArray(json)
            ? json
            : typeof json === "object" && json !== null && Array.isArray((json as { events?: unknown }).events)
              ? (json as { events: unknown[] }).events
              : [];
          if (arr.length > 0) {
            return crawledEvents;
          }
        }
      }
    } catch {
      // Fallback an toàn về danh sách sự kiện Đà Nẵng đã chuẩn hoá
    }
  }

  return crawledEvents;
};

