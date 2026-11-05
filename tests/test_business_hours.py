import datetime
import importlib.util
import pathlib
import re
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'deployment'))
import business_hours as hours
import pbx_routing as routes

LINE = routes.LINES[0]

def active_profile():
    p = hours.default_profile()
    p['enabled'] = True
    return p

def instant(day, time):
    return datetime.datetime.fromisoformat(day + 'T' + time).replace(tzinfo=hours.TZ)

def execute(program, moment):
    local = moment.astimezone(hours.TZ)
    i = 1
    for _ in range(100):
        app = program[i - 1]
        if app.startswith('Playback('):
            return 'closed'
        if app.startswith('Dial('):
            return 'open'
        if app.startswith('GotoIfTime('):
            data = app[len('GotoIfTime('):-1]
            spec, dest = data.split('?')
            times, day, _, _, zone = spec.split(',')
            assert zone == 'Europe/Berlin'
            start, end = times.split('-')
            if hours.DAY_NAMES[local.weekday()] == day and start <= local.strftime('%H:%M') <= end:
                i = int(dest)
                continue
        elif app.startswith('GotoIf('):
            date = re.search(r'=(\d{8})\]\?(\d+)\)', app)
            assert date
            if local.strftime('%Y%m%d') == date[1]:
                i = int(date[2])
                continue
        elif app.startswith('Goto('):
            i = int(app[5:-1])
            continue
        i += 1
    raise AssertionError('Non-terminating program')

class HoursTests(unittest.TestCase):
    def test_disabled_is_always_open(self):
        p = hours.default_profile()
        self.assertTrue(hours.is_open(p, instant('2026-11-08', '23:59')))
        self.assertEqual(hours.compile_program(LINE, '100', p, 1), ('Dial(PJSIP/100,30)', None, []))

    def test_exact_open_and_close_boundaries(self):
        p = active_profile()
        self.assertFalse(hours.is_open(p, instant('2026-11-05', '08:59')))
        self.assertTrue(hours.is_open(p, instant('2026-11-05', '09:00')))
        self.assertTrue(hours.is_open(p, instant('2026-11-05', '16:59')))
        self.assertFalse(hours.is_open(p, instant('2026-11-05', '17:00')))

    def test_closed_today_expires_at_local_midnight(self):
        p = hours.default_profile()
        p['closedDate'] = '2026-11-05'
        self.assertFalse(hours.is_open(p, instant('2026-11-05', '23:59')))
        self.assertTrue(hours.is_open(p, instant('2026-11-06', '00:00')))

    def test_weekend_and_individual_weekday(self):
        p = active_profile()
        self.assertFalse(hours.is_open(p, instant('2026-11-07', '12:00')))
        p['week'][5] = {'enabled': True, 'start': '10:00', 'end': '14:00'}
        self.assertTrue(hours.is_open(p, instant('2026-11-07', '12:00')))

    def test_repeated_dst_hour_has_same_local_behavior(self):
        p = active_profile()
        p['week'][6] = {'enabled': True, 'start': '02:00', 'end': '03:00'}
        for utc_hour in (0, 1):
            moment = datetime.datetime(2026, 10, 25, utc_hour, 30, tzinfo=datetime.timezone.utc)
            self.assertTrue(hours.is_open(p, moment))

    def test_spring_clock_change_uses_berlin(self):
        p = active_profile()
        p['week'][6] = {'enabled': True, 'start': '03:00', 'end': '04:00'}
        self.assertTrue(hours.is_open(p, datetime.datetime(2026, 3, 29, 1, 30, tzinfo=datetime.timezone.utc)))
        self.assertFalse(hours.is_open(p, datetime.datetime(2026, 3, 29, 2, 0, tzinfo=datetime.timezone.utc)))

    def test_reject_invalid_time_and_injection(self):
        for start, end in (('18:00', '09:00'), ('09:00', '09:00'), ('09:00)System(id)', '17:00'), ('25:00', '26:00')):
            p = active_profile()
            p['week'][0]['start'], p['week'][0]['end'] = start, end
            with self.assertRaises(ValueError):
                hours.validate_profile(p)

    def test_profiles_are_disabled_until_explicitly_saved(self):
        self.assertTrue(all(not p['enabled'] for p in hours.all_profiles({}, routes.LINES).values()))

    def test_compiled_program_matches_week_and_boundaries(self):
        p = active_profile()
        p['closedDate'] = '2026-11-05'
        _, _, program = hours.compile_program(LINE, '102', p, 1)
        for date in ('2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'):
            for time in ('00:00', '08:59', '09:00', '16:59', '17:00', '23:59'):
                moment = instant(date, time)
                self.assertEqual(execute(program, moment), 'open' if hours.is_open(p, moment) else 'closed')
        self.assertIn('Answer()', program)
        self.assertIn('Playback(custom/tariq-closed-1)', program)
        self.assertIn('Dial(PJSIP/102,30)', program)

    def test_versioned_context_changes_with_plan(self):
        p = active_profile()
        one = hours.compile_program(LINE, '100', p, 1)[1]
        p['week'][0]['end'] = '18:00'
        self.assertNotEqual(one, hours.compile_program(LINE, '100', p, 1)[1])

    def test_scheduled_config_preserves_unmanaged_lines(self):
        from test_pbx_routing import config
        profiles = hours.all_profiles({}, routes.LINES)
        profiles[LINE] = active_profile()
        apps, _, managed = routes.compile_all(dict(zip(routes.LINES, routes.EXTENSIONS)), profiles)
        rewritten = routes.rewrite_apps(config(), apps, managed)
        self.assertEqual(routes.normalized(rewritten), routes.normalized(config()))
        self.assertIn('exten => 100,1,Dial(PJSIP/100,30)', rewritten)
        self.assertIn('same => n,Gosub(tariq-hours-', rewritten)


    def test_loaded_scheduled_routes_remain_readable(self):
        mappings = dict(zip(routes.LINES, routes.EXTENSIONS))
        profiles = hours.all_profiles({}, routes.LINES)
        profiles[LINE] = active_profile()
        apps, programs, _ = routes.compile_all(mappings, profiles)
        output = ''
        for number, contexts in routes.CONTEXTS.items():
            for context in contexts:
                output += "[ Context '" + context + "' created by 'pbx_config' ]\n"
                output += "'" + number + "' => 1. NoOp(Incoming)\n 2. " + apps[number] + "\n 3. Hangup()\n"
        for (context, number), program in programs.items():
            output += "[ Context '" + context + "' created by 'pbx_config' ]\n"
            for priority, app in enumerate(program, 1):
                output += ("'" + number + "' => " if priority == 1 else ' ') + str(priority) + '. ' + app + '\n'
        self.assertEqual(routes.incoming_apps(output), apps)
        self.assertEqual(routes.parse_live(output), mappings)

if __name__ == '__main__':
    unittest.main()
