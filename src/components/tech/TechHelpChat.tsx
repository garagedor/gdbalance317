import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, FileText, Plus, Scale, CreditCard, Wrench, BookOpen, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { resetOnboarding } from "./TechOnboarding";

type Msg = { role: "bot" | "user"; text: string; actions?: QuickAction[] };

type QuickAction = {
  label: string;
  icon?: React.ElementType;
  onClick: () => void;
};

const WELCOME = `שלום 👋
אני העוזר שלך. איך אפשר לעזור?

תוכל לבחור פעולה מהירה למטה, או לשאול שאלה חופשית בעברית.`;

// Rule-based answer engine — technician scope only
function answer(qRaw: string): string {
  const q = qRaw.toLowerCase().trim();

  const has = (...words: string[]) => words.some((w) => q.includes(w));

  // Add a job
  if (has("מוסיף עבודה", "להוסיף עבודה", "עבודה חדשה", "מוסיפים ג", "ג׳וב חדש", "הוספת עבודה", "מוסיף ג")) {
    return `כדי להוסיף עבודה חדשה:
1. פתח את הרפורט השבועי הנוכחי.
2. לחץ על "+ עבודה חדשה".
3. מלא תאריך, שם לקוח, כתובת.
4. בחר סוג תשלום והזן את הסכום.
5. אם יש חלקים או טיפ — הוסף אותם.
6. שמור.`;
  }

  // Balance negative / minus
  if (has("באלאנס", "balance", "מינוס", "חייב", "אדום", "ירוק", "מגיע לי")) {
    return `ה-Balance מציג כמה כסף עובר בסוף השבוע:

🟢 ירוק (חיובי) — החברה חייבת לך, יקבל תשלום.
🔴 אדום (מינוס) — אתה חייב לחברה (כי גבית מזומן/כרטיס מעבר למה שמגיע לך).

הסכום מחושב לפי כל העבודות, התשלומים, החלקים והטיפים שהזנת.

אם הבאלאנס במינוס — בדוק:
• האם רשמת נכון מזומן שגבית?
• האם הזנת את כל החלקים?
• האם בחרת נכון בין Tech Parts ל-Company Parts?`;
  }

  // Weekly report — when / where
  if (has("רפורט שבועי", "רפורט", "report", "איפה רואה", "איפה הרפורט", "מתי נפתח")) {
    return `הרפורט השבועי נפתח אוטומטית בכל שבוע בשעה 20:00 לפי שעון אינדיאנה (America/Indiana/Indianapolis) — לכל הטכנאים, ללא קשר לאזור.

הוא מכסה את השבוע הקודם (יום שני → יום ראשון).

כדי לראות אותו — היכנס למסך הראשי של הטכנאי. הרפורט הפתוח יופיע בראש הרשימה.`;
  }

  // Tip
  if (has("טיפ", "tip", "tips", "טיפים")) {
    return `כדי להזין טיפ:
1. פתח את העבודה.
2. לחץ על "הוסף טיפ".
3. הזן את הסכום.
4. בחר אם הטיפ התקבל במזומן (Cash) או בכרטיס (Card).

הטיפ מתווסף אוטומטית למה שמגיע לך.`;
  }

  // Payments
  if (has("תשלום", "תשלומים", "cash", "card", "check", "צ׳ק", "צ'ק", "finance", "מימון", "מזומן", "כרטיס")) {
    return `סוגי תשלום זמינים:
• Cash — מזומן מהלקוח (אצלך)
• Card — תשלום בכרטיס אשראי
• Company Cash — מזומן ששייך לחברה
• Check — צ׳ק
• Finance — מימון/הלוואה

חשוב לבחור את הסוג הנכון — כל סוג מחושב אחרת בבאלאנס.`;
  }

  // Parts
  if (has("חלקים", "חלק", "parts", "tech parts", "company parts")) {
    return `שני סוגי חלקים:
• Tech Parts — חלקים שאתה קנית מכספך (יוחזר לך).
• Company Parts — חלקים שהחברה סיפקה (לא מוחזרים לך).

חשוב להבחין נכון בין השניים — זה משפיע על הבאלאנס שלך.`;
  }

  // Edit
  if (has("לערוך", "עריכה", "תיקון", "טעות", "לתקן", "edit")) {
    return `אם הרפורט במצב Draft או Returned — לחץ על העבודה ברשימה ועדכן אותה.

אם הרפורט כבר Submitted — לא ניתן לערוך. פנה למנהל ובקש להחזיר את הרפורט (Returned), אז תוכל לתקן ולשלוח שוב.`;
  }

  // History
  if (has("היסטוריה", "רפורטים קודמים", "ישנים", "ארכיון")) {
    return `במסך הראשי שלך מופיעים כל הרפורטים — חדש למעלה, ישן למטה.

לכל רפורט יש סטטוס (Draft / Submitted / Under Review / Approved / Returned). לחץ על רפורט כדי לראות את כל העבודות בו.`;
  }

  // Submit
  if (has("לשלוח", "שליחה", "submit", "סיום שבוע")) {
    return `כדי לשלוח את הרפורט:
1. ודא שכל העבודות של השבוע הוזנו.
2. בדוק שהבאלאנס נראה נכון.
3. לחץ על "שלח רפורט" בתחתית הרפורט.

אחרי שליחה הסטטוס יהפוך ל-Submitted ולא תוכל לערוך.`;
  }

  // Greetings
  if (has("שלום", "היי", "הי", "בוקר טוב", "ערב טוב")) {
    return `שלום! במה אוכל לעזור היום? תוכל לשאול לדוגמה: "איך אני מוסיף עבודה?" או "למה הבאלאנס שלי במינוס?"`;
  }

  // Default
  return `אני לא בטוח שהבנתי 🤔
תוכל לנסח אחרת או לבחור פעולה מהירה למטה.

נושאים שאני יודע עליהם:
• הוספת עבודה
• סוגי תשלום (Cash / Card / Check / Finance / Company Cash)
• חלקים (Tech / Company)
• טיפים
• הבנת הבאלאנס
• רפורט שבועי — מתי נפתח, איך לראות
• עריכה ותיקון של עבודה
• שליחת הרפורט`;
}

export function TechHelpChat({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const nav = useNavigate();
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "bot", text: WELCOME }]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs, open]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setTimeout(() => {
      setMsgs((m) => [...m, { role: "bot", text: answer(t) }]);
    }, 250);
  };

  const goHome = () => { onOpenChange(false); nav("/tech"); };

  const quickActions: { label: string; icon: React.ElementType; onClick: () => void }[] = [
    { label: "פתיחת רפורט", icon: FileText, onClick: goHome },
    { label: "הוספת עבודה", icon: Plus, onClick: () => send("איך מוסיפים עבודה חדשה?") },
    { label: "צפייה בבאלאנס", icon: Scale, onClick: () => send("איך אני מבין את הבאלאנס?") },
    { label: "הסבר על תשלומים", icon: CreditCard, onClick: () => send("איך מזינים תשלום?") },
    { label: "הסבר על חלקים", icon: Wrench, onClick: () => send("איך מזינים חלקים?") },
    { label: "הצג מדריך מחדש", icon: BookOpen, onClick: () => { resetOnboarding(); onOpenChange(false); window.location.reload(); } },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        dir="rtl"
        className="flex h-[88dvh] w-full flex-col gap-0 rounded-t-2xl p-0 sm:max-w-lg sm:mx-auto"
      >
        <SheetHeader className="flex-row items-center gap-3 border-b px-4 py-3 text-right space-y-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-accent shadow-glow">
            <Bot className="h-5 w-5 text-accent-foreground" />
          </div>
          <div className="flex-1">
            <SheetTitle className="text-base font-bold">עוזר טכנאי · עזרה</SheetTitle>
            <p className="text-[11px] text-muted-foreground">מענה אוטומטי בעברית</p>
          </div>
        </SheetHeader>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-3">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={cn("flex gap-2", m.role === "user" ? "justify-start" : "justify-end")}
              >
                {m.role === "bot" && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    m.role === "bot"
                      ? "bg-muted text-foreground rounded-tr-sm"
                      : "bg-primary text-primary-foreground rounded-tl-sm",
                  )}
                >
                  {m.text}
                </div>
                {m.role === "user" && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="border-t bg-muted/30 px-3 py-2.5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {quickActions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  onClick={a.onClick}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex items-center gap-2 border-t bg-card px-3 py-3"
        >
          <Button type="submit" size="icon" disabled={!input.trim()} aria-label="שלח">
            <Send className="h-4 w-4" />
          </Button>
          <Input
            dir="rtl"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="שאל שאלה בעברית…"
            className="text-right"
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-1.5"
      aria-label="עזרה"
    >
      <HelpCircle className="h-4 w-4" />
      <span>עזרה</span>
    </Button>
  );
}
