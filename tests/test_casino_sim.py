import unittest

from casino_sim import BLACK, RED, CasinoEngine


class FixedRng:
    def __init__(self, outcome):
        self.outcome = outcome

    def choice(self, options):
        if self.outcome not in options:
            raise AssertionError("Fixed outcome must be one of the engine colors.")
        return self.outcome


class CasinoEngineTests(unittest.TestCase):
    def test_game_must_be_started_before_play(self):
        engine = CasinoEngine(rng=FixedRng(RED))

        with self.assertRaises(RuntimeError):
            engine.play(RED, 50)

    def test_winning_round_adds_the_net_bet_to_balance(self):
        engine = CasinoEngine(initial_balance=1000, rng=FixedRng(RED))
        engine.start()

        result = engine.play(RED, 100)

        self.assertTrue(result.won)
        self.assertEqual(result.payout, 200)
        self.assertEqual(result.balance, 1100)

    def test_losing_round_subtracts_the_bet(self):
        engine = CasinoEngine(initial_balance=1000, rng=FixedRng(BLACK))
        engine.start()

        result = engine.play(RED, 100)

        self.assertFalse(result.won)
        self.assertEqual(result.payout, 0)
        self.assertEqual(result.balance, 900)

    def test_bet_cannot_exceed_virtual_balance(self):
        engine = CasinoEngine(initial_balance=100, rng=FixedRng(RED))
        engine.start()

        with self.assertRaises(ValueError):
            engine.play(RED, 101)

    def test_invalid_color_is_rejected(self):
        engine = CasinoEngine(rng=FixedRng(RED))
        engine.start()

        with self.assertRaises(ValueError):
            engine.play("green", 50)

    def test_zero_balance_ends_the_active_game(self):
        engine = CasinoEngine(initial_balance=100, rng=FixedRng(BLACK))
        engine.start()

        result = engine.play(RED, 100)

        self.assertEqual(result.balance, 0)
        self.assertFalse(engine.started)


if __name__ == "__main__":
    unittest.main()
