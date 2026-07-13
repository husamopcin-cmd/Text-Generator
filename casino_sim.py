"""Standalone virtual casino simulator with a Tkinter interface."""

import random
import tkinter as tk
from dataclasses import dataclass
from tkinter import messagebox, ttk

RED = "red"
BLACK = "black"
COLORS = (RED, BLACK)
COLOR_LABELS = {
    RED: "Kırmızı",
    BLACK: "Siyah",
}
STRATEGY_FIXED = "Sabit Bahis"
STRATEGY_MARTINGALE = "Martingale (sanal)"


@dataclass(frozen=True)
class RoundResult:
    guess: str
    outcome: str
    bet: int
    won: bool
    payout: int
    balance: int


class CasinoEngine:
    """Pure virtual-balance game logic, kept independent from Tkinter."""

    def __init__(self, initial_balance=1000, rng=None):
        if initial_balance <= 0:
            raise ValueError("Başlangıç bakiyesi pozitif olmalıdır.")
        self.initial_balance = int(initial_balance)
        self.rng = rng or random.Random()
        self.reset()

    def reset(self):
        self.balance = self.initial_balance
        self.started = False

    def start(self):
        self.started = True

    def play(self, guess, bet):
        if not self.started:
            raise RuntimeError("Oyun henüz başlatılmadı.")
        if guess not in COLORS:
            raise ValueError("Renk seçimi kırmızı veya siyah olmalıdır.")
        if isinstance(bet, bool) or not isinstance(bet, int) or bet <= 0:
            raise ValueError("Bahis pozitif bir tam sayı olmalıdır.")
        if bet > self.balance:
            raise ValueError("Bahis mevcut sanal bakiyeyi aşamaz.")

        outcome = self.rng.choice(COLORS)
        won = outcome == guess
        payout = bet * 2 if won else 0
        self.balance = self.balance - bet + payout

        if self.balance == 0:
            self.started = False

        return RoundResult(
            guess=guess,
            outcome=outcome,
            bet=bet,
            won=won,
            payout=payout,
            balance=self.balance,
        )


class CasinoSim:
    def __init__(self, root=None, rng=None):
        self.root = root or tk.Tk()
        self.engine = CasinoEngine(rng=rng)
        self.round_number = 0
        self.base_bet = 50
        self.current_bet = 50

        self.balance_var = tk.StringVar()
        self.bet_var = tk.StringVar(value="50")
        self.strategy_var = tk.StringVar(value=STRATEGY_FIXED)
        self.color_var = tk.StringVar(value=RED)
        self.next_bet_var = tk.StringVar()
        self.status_var = tk.StringVar(value="Oyunu başlatmak için yeşil butona bas.")
        self._configure_window()
        self._build_ui()
        self._refresh_balance()
        self._refresh_next_bet()
        self._set_game_active(False)

    def _configure_window(self):
        self.root.title("Sanal Casino Simülatörü")
        self.root.geometry("720x610")
        self.root.minsize(680, 560)
        self.root.configure(bg="#101418")
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)

        style = ttk.Style(self.root)
        if "clam" in style.theme_names():
            style.theme_use("clam")
        style.configure("App.TFrame", background="#101418")
        style.configure("Panel.TFrame", background="#192127")
        style.configure(
            "Title.TLabel",
            background="#101418",
            foreground="#f5f7fa",
            font=("Segoe UI", 20, "bold"),
        )
        style.configure(
            "Subtitle.TLabel",
            background="#101418",
            foreground="#a9b4bd",
            font=("Segoe UI", 10),
        )
        style.configure(
            "Balance.TLabel",
            background="#192127",
            foreground="#7ee787",
            font=("Segoe UI", 18, "bold"),
        )
        style.configure(
            "Panel.TLabel",
            background="#192127",
            foreground="#e8edf2",
            font=("Segoe UI", 10),
        )
        style.configure(
            "Start.TButton",
            font=("Segoe UI", 12, "bold"),
            padding=(18, 11),
            foreground="#ffffff",
            background="#238636",
        )
        style.map("Start.TButton", background=[("active", "#2ea043")])
        style.configure("Play.TButton", font=("Segoe UI", 11, "bold"), padding=(14, 9))
        style.configure("Treeview", rowheight=26, font=("Segoe UI", 9))
        style.configure("Treeview.Heading", font=("Segoe UI", 9, "bold"))

    def _build_ui(self):
        main = ttk.Frame(self.root, style="App.TFrame", padding=22)
        main.grid(row=0, column=0, sticky="nsew")
        main.columnconfigure(0, weight=1)
        main.rowconfigure(5, weight=1)

        ttk.Label(main, text="Sanal Casino Simülatörü", style="Title.TLabel").grid(
            row=0, column=0, sticky="w"
        )
        ttk.Label(
            main,
            text="Yalnızca sanal krediyle çalışan renk tahmin oyunu.",
            style="Subtitle.TLabel",
        ).grid(row=1, column=0, sticky="w", pady=(2, 14))

        summary = ttk.Frame(main, style="Panel.TFrame", padding=16)
        summary.grid(row=2, column=0, sticky="ew")
        summary.columnconfigure(0, weight=1)
        ttk.Label(summary, textvariable=self.balance_var, style="Balance.TLabel").grid(
            row=0, column=0, sticky="w"
        )
        ttk.Label(summary, textvariable=self.next_bet_var, style="Panel.TLabel").grid(
            row=1, column=0, sticky="w", pady=(4, 0)
        )
        self.start_button = ttk.Button(
            summary,
            text="OYUNU BAŞLAT",
            command=self.start_game,
            style="Start.TButton",
        )
        self.start_button.grid(row=0, column=1, rowspan=2, padx=(18, 0))

        controls = ttk.LabelFrame(main, text="Tur Ayarları", padding=14)
        controls.grid(row=3, column=0, sticky="ew", pady=14)
        for column in range(4):
            controls.columnconfigure(column, weight=1)

        ttk.Label(controls, text="Başlangıç bahsi").grid(row=0, column=0, sticky="w")
        self.bet_input = ttk.Spinbox(
            controls,
            from_=1,
            to=1000,
            increment=10,
            textvariable=self.bet_var,
            width=12,
        )
        self.bet_input.grid(row=1, column=0, sticky="ew", padx=(0, 12), pady=(4, 0))

        ttk.Label(controls, text="Strateji").grid(row=0, column=1, sticky="w")
        self.strategy_input = ttk.Combobox(
            controls,
            textvariable=self.strategy_var,
            values=(STRATEGY_FIXED, STRATEGY_MARTINGALE),
            state="readonly",
            width=20,
        )
        self.strategy_input.grid(row=1, column=1, sticky="ew", padx=(0, 12), pady=(4, 0))

        ttk.Label(controls, text="Renk tahmini").grid(row=0, column=2, sticky="w")
        color_frame = ttk.Frame(controls)
        color_frame.grid(row=1, column=2, sticky="w", pady=(4, 0))
        self.red_choice = ttk.Radiobutton(
            color_frame, text="Kırmızı", variable=self.color_var, value=RED
        )
        self.red_choice.pack(side="left")
        self.black_choice = ttk.Radiobutton(
            color_frame, text="Siyah", variable=self.color_var, value=BLACK
        )
        self.black_choice.pack(side="left", padx=(10, 0))

        self.play_button = ttk.Button(
            controls,
            text="TURU OYNA",
            command=self.play_round,
            style="Play.TButton",
        )
        self.play_button.grid(row=0, column=3, rowspan=2, sticky="ew", padx=(12, 0))

        self.status_label = tk.Label(
            main,
            textvariable=self.status_var,
            bg="#192127",
            fg="#e8edf2",
            anchor="w",
            padx=14,
            pady=10,
            font=("Segoe UI", 10, "bold"),
        )
        self.status_label.grid(row=4, column=0, sticky="ew", pady=(0, 14))

        history_frame = ttk.Frame(main, style="App.TFrame")
        history_frame.grid(row=5, column=0, sticky="nsew")
        history_frame.columnconfigure(0, weight=1)
        history_frame.rowconfigure(0, weight=1)

        columns = ("round", "guess", "outcome", "bet", "result", "balance")
        self.history = ttk.Treeview(
            history_frame,
            columns=columns,
            show="headings",
            height=9,
        )
        headings = {
            "round": "Tur",
            "guess": "Tahmin",
            "outcome": "Sonuç",
            "bet": "Bahis",
            "result": "Durum",
            "balance": "Bakiye",
        }
        widths = {
            "round": 55,
            "guess": 100,
            "outcome": 100,
            "bet": 85,
            "result": 90,
            "balance": 100,
        }
        for column in columns:
            self.history.heading(column, text=headings[column])
            self.history.column(column, width=widths[column], anchor="center")

        scrollbar = ttk.Scrollbar(
            history_frame, orient="vertical", command=self.history.yview
        )
        self.history.configure(yscrollcommand=scrollbar.set)
        self.history.grid(row=0, column=0, sticky="nsew")
        scrollbar.grid(row=0, column=1, sticky="ns")

        actions = ttk.Frame(main, style="App.TFrame")
        actions.grid(row=6, column=0, sticky="ew", pady=(14, 0))
        ttk.Button(actions, text="Sıfırla", command=self.reset_game).pack(side="left")
        ttk.Button(actions, text="Kapat", command=self.root.destroy).pack(side="right")

        self.root.bind("<Return>", self._play_from_keyboard)
        self.root.bind("<Escape>", lambda _event: self.root.destroy())

    def _parse_base_bet(self):
        try:
            value = int(self.bet_var.get().strip())
        except ValueError as exc:
            raise ValueError("Bahis alanına tam sayı gir.") from exc
        if value <= 0:
            raise ValueError("Bahis sıfırdan büyük olmalıdır.")
        if value > self.engine.balance:
            raise ValueError("Bahis sanal bakiyeyi aşamaz.")
        return value

    def _set_game_active(self, active):
        self.start_button.configure(state="disabled" if active else "normal")
        self.play_button.configure(state="normal" if active else "disabled")
        input_state = "disabled" if active else "normal"
        self.bet_input.configure(state=input_state)
        self.strategy_input.configure(state="disabled" if active else "readonly")
        self.red_choice.configure(state="normal" if active else "disabled")
        self.black_choice.configure(state="normal" if active else "disabled")

    def _refresh_balance(self):
        self.balance_var.set(f"Sanal bakiye: {self.engine.balance} kredi")

    def _refresh_next_bet(self):
        self.next_bet_var.set(f"Sıradaki bahis: {self.current_bet} kredi")

    def start_game(self):
        try:
            self.base_bet = self._parse_base_bet()
        except ValueError as exc:
            messagebox.showerror("Geçersiz bahis", str(exc), parent=self.root)
            return

        self.engine.start()
        self.current_bet = self.base_bet
        self.status_var.set("Oyun başladı. Rengini seç ve TURU OYNA butonuna bas.")
        self.status_label.configure(fg="#7ee787")
        self._set_game_active(True)
        self._refresh_next_bet()
        messagebox.showinfo(
            "Oyun başladı",
            "Sanal oyun hazır. Rengini seçip ilk turu oynayabilirsin.",
            parent=self.root,
        )

    def play_round(self):
        if not self.engine.started:
            return

        if self.strategy_var.get() == STRATEGY_FIXED:
            try:
                self.current_bet = self._parse_base_bet()
            except ValueError as exc:
                messagebox.showerror("Geçersiz bahis", str(exc), parent=self.root)
                return

        bet = min(self.current_bet, self.engine.balance)
        try:
            result = self.engine.play(self.color_var.get(), bet)
        except (RuntimeError, ValueError) as exc:
            messagebox.showerror("Tur oynanamadı", str(exc), parent=self.root)
            return

        self.round_number += 1
        result_text = "Kazandın" if result.won else "Kaybettin"
        self.history.insert(
            "",
            "end",
            values=(
                self.round_number,
                COLOR_LABELS[result.guess],
                COLOR_LABELS[result.outcome],
                f"{result.bet}",
                result_text,
                f"{result.balance}",
            ),
        )
        self.history.yview_moveto(1.0)

        if result.won:
            self.status_var.set(
                f"{COLOR_LABELS[result.outcome]} geldi. +{result.bet} kredi kazandın."
            )
            self.status_label.configure(fg="#7ee787")
        else:
            self.status_var.set(
                f"{COLOR_LABELS[result.outcome]} geldi. {result.bet} kredi kaybettin."
            )
            self.status_label.configure(fg="#ff7b72")

        if self.strategy_var.get() == STRATEGY_MARTINGALE:
            self.current_bet = (
                self.base_bet
                if result.won
                else min(result.bet * 2, self.engine.balance)
            )
        else:
            self.current_bet = self.base_bet

        self._refresh_balance()
        self._refresh_next_bet()

        if self.engine.balance == 0:
            self.play_button.configure(state="disabled")
            self.status_var.set("Sanal bakiye bitti. Yeni oyun için Sıfırla'ya bas.")
            messagebox.showwarning(
                "Oyun bitti",
                "Sanal bakiyen bitti. Sıfırla ile yeniden başlayabilirsin.",
                parent=self.root,
            )

    def reset_game(self):
        self.engine.reset()
        self.round_number = 0
        self.base_bet = 50
        self.current_bet = 50
        self.bet_var.set("50")
        self.strategy_var.set(STRATEGY_FIXED)
        self.color_var.set(RED)
        for item in self.history.get_children():
            self.history.delete(item)
        self.status_var.set("Oyunu başlatmak için yeşil butona bas.")
        self.status_label.configure(fg="#e8edf2")
        self._refresh_balance()
        self._refresh_next_bet()
        self._set_game_active(False)

    def _play_from_keyboard(self, _event):
        if self.engine.started:
            self.play_round()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    CasinoSim().run()
