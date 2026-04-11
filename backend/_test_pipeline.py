import asyncio, sys
sys.path.insert(0, '.')

async def test():
    from services import firebase_service
    print('use_firestore():', firebase_service._use_firestore())

    from services import planner_service
    result = await planner_service.generate_plan(user_id='test_student')
    data = result.model_dump()

    print()
    print('=== SUCCESS ===')
    print('Events:', len(data['sorted_events']))
    if data['sorted_events']:
        top = data['sorted_events'][0]
        print('Top event :', top['title'])
        print('Score     :', top['priority_score'])
        print('Breakdown :', top['score_breakdown'])
    plan = data['daily_plan']
    print()
    print('Focus     :', plan['focus_verdict'])
    print('Blocks    :', len(plan['hourly_breakdown']))
    for b in plan['hourly_breakdown'][:3]:
        print(' ', b['hours'], 'h ->', b['task'][:60])
    warning = plan['warning']
    print('Warning   :', (warning[:80] + '...') if len(warning) > 80 else (warning or '(none)'))

asyncio.run(test())
