import asyncio, socket
async def main():
    try:
        loop = asyncio.get_event_loop()
        await asyncio.wait_for(loop.getaddrinfo('www.completely-fake-unregistered-domain.com', None), timeout=1.5)
    except Exception as e:
        print(type(e))
asyncio.run(main())
