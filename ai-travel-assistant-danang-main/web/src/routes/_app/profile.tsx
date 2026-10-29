import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CircleAlert, RotateCcw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { profileQueryOptions, saveProfile } from "@/api";
import type { ProfileInput, TravelerProfile, User } from "@/api";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, formatDate, formatMoney } from "@/lib/display";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

const emptyForm: ProfileInput = {
  nationality: "",
  language: "vi",
  originCity: "",
  budgetMin: "",
  budgetMax: "",
  currency: "VND",
  travelStyle: "",
  interests: "",
  dislikes: "",
};

const toProfileForm = (profile: TravelerProfile): ProfileInput => ({
  nationality: profile.nationality ?? "",
  language: profile.language || "vi",
  originCity: profile.originCity ?? "",
  budgetMin: profile.budgetMin ?? "",
  budgetMax: profile.budgetMax ?? "",
  // Hồ sơ cũ có thể thiếu tiền tệ, mặc định VND để lần lưu sau không xoá trắng.
  currency: profile.currency || "VND",
  travelStyle: profile.travelStyle ?? "",
  interests: profile.interests.join(", "),
  dislikes: profile.dislikes.join(", "),
});

const languages = [
  ["vi", "Tiếng Việt"],
  ["en", "English"],
  ["ko", "한국어"],
  ["ja", "日本語"],
  ["zh", "中文"],
] as const;

const currencies: readonly string[] = ["VND", "USD", "EUR", "JPY", "KRW"];

const travelStyles = [
  "nghỉ dưỡng",
  "khám phá",
  "tiết kiệm",
  "gia đình",
  "mạo hiểm",
] as const;

// Field dùng cho thanh đầy đủ hồ sơ, đếm theo giá trị chuỗi trong form.
const filledFields: (keyof ProfileInput)[] = [
  "nationality",
  "language",
  "originCity",
  "travelStyle",
  "budgetMin",
  "budgetMax",
  "currency",
  "interests",
  "dislikes",
];

// ui/select.tsx dựng trên base-ui và chưa dùng ở đâu trong repo, nên dùng
// select gốc của trình duyệt với class giống Input.
const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";

const splitList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

// Giữ giá trị cũ ngoài danh sách gợi ý để select không hiện sai.
const withCurrent = (options: readonly string[], value: string) =>
  value !== "" && !options.includes(value) ? [value, ...options] : options;

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const query = useQuery(profileQueryOptions);

  return (
    <div className="grid max-w-5xl gap-4">
      <div>
        <h1 className="text-xl font-medium">Hồ sơ du khách</h1>
        <p className="text-muted-foreground text-sm">
          Trợ lý AI dùng hồ sơ này để gợi ý địa điểm, ngân sách và lịch trình sát
          ý bạn.
        </p>
      </div>

      {query.isPending ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="grid gap-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <Skeleton className="h-60 w-full" />
        </div>
      ) : query.isError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được hồ sơ</AlertTitle>
          <AlertDescription>{errorMessage(query.error)}</AlertDescription>
          <AlertAction>
            <Button
              variant="outline"
              size="xs"
              onClick={() => void query.refetch()}
            >
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <ProfileForm user={user} profile={query.data ?? null} />
      )}
    </div>
  );
}

function ProfileForm({
  user,
  profile,
}: {
  user: User;
  profile: TravelerProfile | null;
}) {
  const queryClient = useQueryClient();
  const [initial, setInitial] = useState<ProfileInput>(() =>
    profile ? toProfileForm(profile) : emptyForm,
  );
  const [form, setForm] = useState<ProfileInput>(initial);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: saveProfile,
    onSuccess: (next) => {
      queryClient.setQueryData(profileQueryOptions.queryKey, next);
      setInitial(form);
      setSaved(true);
    },
  });

  const set = (field: keyof ProfileInput, value: string) => {
    setSaved(false);
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const removeChip = (field: "interests" | "dislikes", item: string) =>
    set(
      field,
      splitList(form[field])
        .filter((value) => value !== item)
        .join(", "),
    );

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const budgetError =
    form.budgetMin !== "" &&
    form.budgetMax !== "" &&
    Number(form.budgetMax) < Number(form.budgetMin)
      ? "Ngân sách cao nhất phải lớn hơn hoặc bằng ngân sách thấp nhất."
      : "";
  const completed = filledFields.filter(
    (field) => form[field].trim() !== "",
  ).length;
  const percent = Math.round((completed / filledFields.length) * 100);
  const interests = splitList(form.interests);
  const dislikes = splitList(form.dislikes);
  const hasPreview = Boolean(
    form.travelStyle ||
      interests.length ||
      dislikes.length ||
      form.budgetMin ||
      form.budgetMax,
  );

  const status = mutation.isPending
    ? "Đang lưu..."
    : saved && !dirty
      ? "Đã lưu hồ sơ."
      : dirty
        ? "Có thay đổi chưa lưu."
        : profile
          ? "Không có thay đổi."
          : "Hồ sơ còn trống, điền vài mục rồi lưu.";

  return (
    <form
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]"
      onSubmit={(event) => {
        event.preventDefault();
        if (!dirty || budgetError !== "") return;
        mutation.mutate(form);
      }}
    >
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin cơ bản</CardTitle>
            <CardDescription>
              Giúp trợ lý chọn địa điểm, ngôn ngữ và khung giờ phù hợp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field className="gap-1.5">
                <FieldLabel htmlFor="nationality">Quốc tịch</FieldLabel>
                <Input
                  id="nationality"
                  maxLength={2}
                  placeholder="VN"
                  value={form.nationality}
                  onChange={(event) =>
                    set("nationality", event.target.value.toUpperCase())
                  }
                />
                <FieldDescription>Mã quốc gia 2 ký tự.</FieldDescription>
              </Field>

              <Field className="gap-1.5">
                <FieldLabel htmlFor="language">Ngôn ngữ</FieldLabel>
                <select
                  id="language"
                  className={selectClass}
                  value={form.language}
                  onChange={(event) => set("language", event.target.value)}
                >
                  {form.language !== "" &&
                  !languages.some(([code]) => code === form.language) ? (
                    <option value={form.language}>{form.language}</option>
                  ) : null}
                  {languages.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
                <FieldDescription>Ngôn ngữ trợ lý trả lời.</FieldDescription>
              </Field>

              <Field className="gap-1.5">
                <FieldLabel htmlFor="originCity">Thành phố xuất phát</FieldLabel>
                <Input
                  id="originCity"
                  placeholder="Hà Nội"
                  value={form.originCity}
                  onChange={(event) => set("originCity", event.target.value)}
                />
              </Field>

              <Field className="gap-1.5">
                <FieldLabel htmlFor="travelStyle">Phong cách du lịch</FieldLabel>
                <Input
                  id="travelStyle"
                  placeholder="nghỉ dưỡng, khám phá"
                  value={form.travelStyle}
                  onChange={(event) => set("travelStyle", event.target.value)}
                />
                <div className="flex flex-wrap gap-1.5">
                  {travelStyles.map((style) => (
                    <Button
                      key={style}
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={form.travelStyle === style}
                      onClick={() => set("travelStyle", style)}
                    >
                      {style}
                    </Button>
                  ))}
                </div>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ngân sách và sở thích</CardTitle>
            <CardDescription>
              Dùng để lọc gợi ý và tính chi phí lịch trình.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <FieldGroup className="grid gap-4 sm:grid-cols-3">
              <Field className="gap-1.5">
                <FieldLabel htmlFor="budgetMin">Ngân sách thấp nhất</FieldLabel>
                <Input
                  id="budgetMin"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-invalid={budgetError !== ""}
                  value={form.budgetMin}
                  onChange={(event) => set("budgetMin", event.target.value)}
                />
              </Field>

              <Field className="gap-1.5">
                <FieldLabel htmlFor="budgetMax">Ngân sách cao nhất</FieldLabel>
                <Input
                  id="budgetMax"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-invalid={budgetError !== ""}
                  value={form.budgetMax}
                  onChange={(event) => set("budgetMax", event.target.value)}
                />
              </Field>

              <Field className="gap-1.5">
                <FieldLabel htmlFor="currency">Tiền tệ</FieldLabel>
                <select
                  id="currency"
                  className={selectClass}
                  value={form.currency}
                  onChange={(event) => set("currency", event.target.value)}
                >
                  {withCurrent(currencies, form.currency).map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </Field>
            </FieldGroup>

            {budgetError !== "" ? (
              <FieldError>{budgetError}</FieldError>
            ) : null}

            <Field className="gap-1.5">
              <FieldLabel htmlFor="interests">Sở thích</FieldLabel>
              <Textarea
                id="interests"
                rows={2}
                placeholder="ẩm thực địa phương, biển, cà phê"
                value={form.interests}
                onChange={(event) => set("interests", event.target.value)}
              />
              <FieldDescription>
                Cách nhau dấu phẩy. Bấm chip để bỏ.
              </FieldDescription>
              {interests.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {interests.map((item) => (
                    <Badge key={item} variant="secondary" className="gap-1 pr-1">
                      {item}
                      <button
                        type="button"
                        aria-label={`Bỏ ${item}`}
                        className="rounded-full opacity-60 transition-opacity hover:opacity-100"
                        onClick={() => removeChip("interests", item)}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </Field>

            <Field className="gap-1.5">
              <FieldLabel htmlFor="dislikes">Không muốn</FieldLabel>
              <Textarea
                id="dislikes"
                rows={2}
                placeholder="đông người, leo núi"
                value={form.dislikes}
                onChange={(event) => set("dislikes", event.target.value)}
              />
              <FieldDescription>
                Trợ lý tránh các mục này khi gợi ý.
              </FieldDescription>
              {dislikes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {dislikes.map((item) => (
                    <Badge
                      key={item}
                      variant="destructive"
                      className="gap-1 pr-1"
                    >
                      {item}
                      <button
                        type="button"
                        aria-label={`Bỏ ${item}`}
                        className="rounded-full opacity-60 transition-opacity hover:opacity-100"
                        onClick={() => removeChip("dislikes", item)}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="grid h-fit gap-4 lg:sticky lg:top-24">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-sky-500" />
              Trợ lý AI dùng gì
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {hasPreview ? (
              <div className="flex flex-wrap gap-1.5">
                {form.travelStyle ? (
                  <Badge variant="outline">{form.travelStyle}</Badge>
                ) : null}
                {interests.map((item) => (
                  <Badge key={item} variant="secondary">
                    {item}
                  </Badge>
                ))}
                {dislikes.map((item) => (
                  <Badge key={item} variant="destructive">
                    {item}
                  </Badge>
                ))}
                {form.budgetMin || form.budgetMax ? (
                  <Badge variant="outline">
                    {formatMoney(form.budgetMin)} –{" "}
                    {formatMoney(form.budgetMax)} {form.currency}
                  </Badge>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Hồ sơ còn trống. Thêm sở thích và ngân sách để gợi ý sát hơn.
              </p>
            )}

            <div className="grid gap-1.5">
              <div className="text-muted-foreground flex items-center justify-between text-xs">
                <span>Độ đầy đủ hồ sơ</span>
                <span className="tabular-nums">{percent}%</span>
              </div>
              <Progress value={percent} />
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Avatar size="lg">
                <AvatarImage src={user.avatarUrl} alt={user.fullName ?? user.email} />
                <AvatarFallback>
                  {(user.fullName ?? user.email).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {user.fullName ?? user.email}
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  {user.email}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Vai trò</span>
              <Badge variant="outline">
                {user.role === "admin" ? "Quản trị viên" : "Du khách"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Tham gia</span>
              <span>{formatDate(user.createdAt)}</span>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm" render={<Link to="/sessions" />}>
              Phiên đăng nhập
            </Button>
          </CardFooter>
        </Card>
      </div>

      {mutation.error ? (
        <Alert variant="destructive" className="lg:col-span-2">
          <CircleAlert />
          <AlertTitle>Không lưu được hồ sơ</AlertTitle>
          <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="bg-background/90 sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5 backdrop-blur lg:col-span-2">
        <p
          className={cn(
            "text-sm",
            budgetError !== ""
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {budgetError !== "" ? budgetError : status}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!dirty || mutation.isPending}
            onClick={() => {
              setForm(initial);
              setSaved(false);
            }}
          >
            <RotateCcw data-icon="inline-start" />
            Hoàn tác
          </Button>
          <Button
            type="submit"
            disabled={!dirty || mutation.isPending || budgetError !== ""}
          >
            {mutation.isPending ? "Đang lưu..." : "Lưu hồ sơ"}
          </Button>
        </div>
      </div>
    </form>
  );
}
