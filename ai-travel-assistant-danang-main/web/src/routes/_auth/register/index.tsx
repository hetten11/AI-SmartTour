import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Mail, User as UserIcon, UserPlus } from "lucide-react";
import { register } from "@/api";
import { PasswordInput } from "@/components/password-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { firstError } from "@/lib/form";
import {
  validateEmail,
  validateFullName,
  validatePassword,
  validatePasswordConfirm,
} from "@/lib/validation";

export const Route = createFileRoute("/_auth/register/")({
  component: RegisterPage,
});

function getPasswordStrength(password: string): {
  score: number;
  label: string;
} {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) || /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) score += 1;

  if (score <= 1) return { score: 1, label: "Yếu" };
  if (score <= 3) return { score: 2, label: "Trung bình" };
  return { score: 3, label: "Mạnh" };
}

function RegisterPage() {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: register,
    onSuccess: (user) => {
      queryClient.setQueryData(["me"], user);
      void navigate({ to: "/" });
    },
  });

  const form = useForm({
    defaultValues: {
      email: "",
      fullName: "",
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({
        email: value.email,
        fullName: value.fullName,
        password: value.password,
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl font-bold tracking-tight">
          Tạo tài khoản
        </CardTitle>
        <CardDescription>
          Đăng ký để cá nhân hóa lịch trình và khám phá Đà Nẵng.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {mutation.error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Đăng ký không thành công</AlertTitle>
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <form
          id="register-form"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field
              name="email"
              validators={{
                onChange: ({ value }) => validateEmail(value),
                onSubmit: ({ value }) => validateEmail(value),
              }}
            >
              {(field) => {
                const error = firstError(field.state.meta.errors);
                return (
                  <Field data-invalid={!!error}>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon>
                        <Mail />
                      </InputGroupAddon>
                      <InputGroupInput
                        id={field.name}
                        name={field.name}
                        type="email"
                        autoComplete="email"
                        placeholder="tenban@example.com"
                        value={field.state.value}
                        aria-invalid={!!error}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </InputGroup>
                    {error ? <FieldError>{error}</FieldError> : null}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field
              name="fullName"
              validators={{
                onChange: ({ value }) => validateFullName(value),
                onSubmit: ({ value }) => validateFullName(value),
              }}
            >
              {(field) => {
                const error = firstError(field.state.meta.errors);
                return (
                  <Field data-invalid={!!error}>
                    <FieldLabel htmlFor={field.name}>Họ và tên</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon>
                        <UserIcon />
                      </InputGroupAddon>
                      <InputGroupInput
                        id={field.name}
                        name={field.name}
                        autoComplete="name"
                        placeholder="Nguyễn Văn A"
                        value={field.state.value}
                        aria-invalid={!!error}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </InputGroup>
                    {error ? <FieldError>{error}</FieldError> : null}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field
              name="password"
              validators={{
                onChange: ({ value }) => validatePassword(value),
                onSubmit: ({ value }) => validatePassword(value),
              }}
            >
              {(field) => {
                const error = firstError(field.state.meta.errors);
                const strength = getPasswordStrength(field.state.value);
                return (
                  <Field data-invalid={!!error}>
                    <FieldLabel htmlFor={field.name}>Mật khẩu</FieldLabel>
                    <PasswordInput
                      id={field.name}
                      name={field.name}
                      autoComplete="new-password"
                      placeholder="Tối thiểu 8 ký tự"
                      value={field.state.value}
                      aria-invalid={!!error}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {field.state.value ? (
                      <div className="flex flex-col gap-1">
                        <Progress
                          value={(strength.score / 3) * 100}
                          className="h-1.5"
                        />
                        <span className="text-muted-foreground text-xs">
                          Độ mạnh:{" "}
                          <span className="text-foreground font-medium">
                            {strength.label}
                          </span>
                        </span>
                      </div>
                    ) : null}
                    {error ? <FieldError>{error}</FieldError> : null}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field
              name="confirmPassword"
              validators={{
                onChangeListenTo: ["password"],
                onChange: ({ value }) =>
                  validatePasswordConfirm(
                    form.getFieldValue("password"),
                    value,
                  ),
                onSubmit: ({ value }) =>
                  validatePasswordConfirm(
                    form.getFieldValue("password"),
                    value,
                  ),
              }}
            >
              {(field) => {
                const error = firstError(field.state.meta.errors);
                return (
                  <Field data-invalid={!!error}>
                    <FieldLabel htmlFor={field.name}>
                      Nhập lại mật khẩu
                    </FieldLabel>
                    <PasswordInput
                      id={field.name}
                      name={field.name}
                      autoComplete="new-password"
                      placeholder="Nhập lại mật khẩu"
                      value={field.state.value}
                      aria-invalid={!!error}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {error ? <FieldError>{error}</FieldError> : null}
                  </Field>
                );
              }}
            </form.Field>
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col gap-4">
        <Button
          className="w-full"
          form="register-form"
          type="submit"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <>
              <Spinner data-icon="inline-start" />
              Đang tạo tài khoản...
            </>
          ) : (
            <>
              <UserPlus data-icon="inline-start" />
              Đăng ký tài khoản
            </>
          )}
        </Button>

        <p className="text-muted-foreground text-center text-sm">
          Đã có tài khoản?{" "}
          <Link
            className="text-foreground font-medium underline-offset-4 hover:underline"
            to="/login"
          >
            Đăng nhập ngay
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
