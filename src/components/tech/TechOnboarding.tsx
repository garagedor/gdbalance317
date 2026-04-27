import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight, FileText, Plus, CreditCard, Wrench, Coins, Scale, History, Edit3, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "tech_onboarding_v1_dismissed";

type Step = {
  icon: React.ElementType;
  title: string;
  body: React.ReactNode;
};

const STEPS: Step[] = [
  {
    icon: FileText,
    title: "פתיחת רפורט שבועי",
    body: (
      <>
        <p>הרפורט השבועי נפתח <b>אוטומטית</b> בכל יום ראשון בשעה <b>21:30</b> לפי השעון המקומי של האזור שלך.</p>
        <p className="mt-2">הרפורט מכסה את השבוע הקודם — מ<b>יום שני</b> עד <b>יום ראשון</b>.</p>
        <p className="mt-2">תוכל לראות את הרפורט הפתוח במסך הראשי ולפתוח אותו בלחיצה.</p>
      </>
    ),
  },
  {
    icon: Plus,
    title: "הוספת עבודה חדשה",
    body: (
      <>
        <p>בתוך הרפורט השבועי, לחץ על כפתור <b>"+ עבודה חדשה"</b> כדי להוסיף ג׳וב.</p>
        <p className="mt-2">מלא את הפרטים: תאריך, שם לקוח, כתובת, סוג תשלום וסכום.</p>
      </>
    ),
  },
  {
    icon: CreditCard,
    title: "הזנת תשלום",
    body: (
      <>
        <p>קיימים מספר סוגי תשלום:</p>
        <ul className="mt-2 list-disc space-y-1 pr-5">
          <li><b>Cash</b> — מזומן שהתקבל מהלקוח</li>
          <li><b>Card</b> — תשלום בכרטיס אשראי</li>
          <li><b>Company Cash</b> — מזומן ששייך לחברה</li>
          <li><b>Check</b> — צ׳ק</li>
          <li><b>Finance</b> — מימון/הלוואה</li>
        </ul>
        <p className="mt-2">בחר את הסוג הנכון — זה משפיע על חישוב הבאלאנס.</p>
      </>
    ),
  },
  {
    icon: Wrench,
    title: "הזנת חלקים",
    body: (
      <>
        <p>בעבודה ניתן להזין שני סוגי חלקים:</p>
        <ul className="mt-2 list-disc space-y-1 pr-5">
          <li><b>Tech Parts</b> — חלקים שאתה קנית מכספך</li>
          <li><b>Company Parts</b> — חלקים שהחברה סיפקה</li>
        </ul>
        <p className="mt-2">חשוב להזין נכון — זה משפיע על מה שמגיע לך בסוף השבוע.</p>
      </>
    ),
  },
  {
    icon: Coins,
    title: "הזנת טיפים",
    body: (
      <>
        <p>בכל עבודה אפשר להוסיף <b>Tip</b> שהתקבל מהלקוח.</p>
        <p className="mt-2">בחר אם הטיפ התקבל ב<b>מזומן</b> או ב<b>כרטיס</b>.</p>
        <p className="mt-2">הטיפים מתווספים לחישוב הסופי של מה שמגיע לך.</p>
      </>
    ),
  },
  {
    icon: Scale,
    title: "הבנת ה-Balance",
    body: (
      <>
        <p>ה-Balance הוא הסכום הסופי בסוף השבוע:</p>
        <ul className="mt-3 space-y-2">
          <li className="flex items-start gap-2">
            <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full bg-emerald-500" />
            <span><b>ירוק / חיובי</b> — מגיע <b>לך</b> מהחברה</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full bg-rose-500" />
            <span><b>אדום / מינוס</b> — אתה <b>חייב</b> לחברה</span>
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: History,
    title: "היסטוריית עבודות",
    body: (
      <>
        <p>במסך הראשי תראה את כל הרפורטים הקודמים שלך עם הסטטוס:</p>
        <p className="mt-2"><b>Draft</b> · <b>Submitted</b> · <b>Under Review</b> · <b>Approved</b> · <b>Returned</b></p>
        <p className="mt-2">לחץ על רפורט כדי לראות את כל העבודות בשבוע.</p>
      </>
    ),
  },
  {
    icon: Edit3,
    title: "עריכת עבודה קיימת",
    body: (
      <>
        <p>ניתן לערוך עבודה כל עוד הרפורט במצב <b>Draft</b> או <b>Returned</b>.</p>
        <p className="mt-2">לחץ על העבודה ברשימה כדי לערוך פרטים, סכומים או חלקים.</p>
        <p className="mt-2">אחרי שליחה (Submitted) לא ניתן לערוך — פנה למנהל.</p>
      </>
    ),
  },
  {
    icon: Clock,
    title: "מתי הרפורטים נפתחים?",
    body: (
      <>
        <p>רפורט שבועי חדש נפתח <b>אוטומטית</b> כל יום ראשון בשעה <b>21:30</b> לפי השעון המקומי של האזור שלך.</p>
        <p className="mt-2">דוגמאות:</p>
        <ul className="mt-2 list-disc space-y-1 pr-5">
          <li>שיקגו — 21:30 שעון מרכז (CT)</li>
          <li>אוהיו — 21:30 שעון מזרח (ET)</li>
          <li>אינדיאנה — לפי הטיים זון המוגדר</li>
        </ul>
      </>
    ),
  },
  {
    icon: AlertTriangle,
    title: "מה עושים אם יש טעות?",
    body: (
      <>
        <p>אם הרפורט עדיין במצב <b>Draft</b> — פשוט תקן את העבודה ושלח מחדש.</p>
        <p className="mt-2">אם הרפורט כבר נשלח (<b>Submitted</b>) — פנה למנהל ובקש להחזיר אותו (<b>Returned</b>) כדי לתקן.</p>
        <p className="mt-2">אחרי תיקון — שלח שוב.</p>
      </>
    ),
  },
];

export function TechOnboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [dontShow, setDontShow] = useState(true);

  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  const isLast = idx === STEPS.length - 1;
  const step = STEPS[idx];
  const Icon = step.icon;

  const finish = () => {
    if (dontShow) localStorage.setItem(STORAGE_KEY, "1");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) finish(); }}>
      <DialogContent
        dir="rtl"
        className="max-w-md gap-0 p-0 overflow-hidden"
      >
        {/* Progress */}
        <div className="flex gap-1 p-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= idx ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>

        {/* Body */}
        <div className="px-6 pb-2 pt-2 text-right">
          <div className="mb-4 flex items-center justify-end gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                שלב {idx + 1} מתוך {STEPS.length}
              </p>
              <h2 className="font-display text-xl font-bold leading-tight">{step.title}</h2>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl gradient-accent shadow-glow">
              <Icon className="h-6 w-6 text-accent-foreground" />
            </div>
          </div>
          <div className="min-h-[180px] text-sm leading-relaxed text-foreground/90">
            {step.body}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t bg-muted/30 px-6 py-4">
          <label className="mb-3 flex cursor-pointer items-center justify-end gap-2 text-sm">
            <span>אל תציג שוב</span>
            <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(!!v)} />
          </label>
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={finish}>דלג</Button>
            <div className="flex gap-2">
              {idx > 0 && (
                <Button variant="outline" size="sm" onClick={() => setIdx(idx - 1)}>
                  <ChevronRight className="ml-1 h-4 w-4" />
                  הקודם
                </Button>
              )}
              {!isLast ? (
                <Button size="sm" onClick={() => setIdx(idx + 1)}>
                  הבא
                  <ChevronLeft className="mr-1 h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" onClick={finish}>סיום</Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useFirstTimeOnboarding() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, []);
  return { open, setOpen };
}

export function resetOnboarding() {
  localStorage.removeItem(STORAGE_KEY);
}
