import { beforeEach, expect, it, vi } from 'vitest';
import { registerEditorialAccount } from '@/lib/editorial-signup';
const user={uid:'new-user',getIdToken:vi.fn()};
const deps={create:vi.fn(),current:vi.fn(),send:vi.fn()};
beforeEach(()=>{vi.resetAllMocks();user.getIdToken.mockResolvedValue('fixture-token');deps.create.mockResolvedValue({user});deps.current.mockReturnValue(user);deps.send.mockResolvedValue(undefined);});
it('creates a normalized allowed account then sends exactly one verification',async()=>{
 await registerEditorialAccount(' CASPER@APROPOSMAGAZINE.COM ','fixture-password',deps);
 expect(deps.create).toHaveBeenCalledWith('casper@aproposmagazine.com','fixture-password');
 expect(deps.send).toHaveBeenCalledExactlyOnceWith('fixture-token');
});
it('does not create or send for outside accounts',async()=>{
 await expect(registerEditorialAccount('outside@example.com','fixture',deps)).rejects.toThrow('godkendte');
 expect(deps.create).not.toHaveBeenCalled();expect(deps.send).not.toHaveBeenCalled();
});
it('preserves the original creation error without sending',async()=>{
 const error=Object.assign(new Error('exists'),{code:'auth/email-already-in-use'});deps.create.mockRejectedValue(error);
 await expect(registerEditorialAccount('milo@aproposmagazine.com','fixture',deps)).rejects.toBe(error);
 expect(deps.send).not.toHaveBeenCalled();
});
it('reports the already-created account when mail delivery fails, without recreating it',async()=>{
 deps.send.mockRejectedValue(new Error('provider offline'));
 await expect(registerEditorialAccount('milo@aproposmagazine.com','fixture',deps)).rejects.toMatchObject({code:'auth/verification-send-failed'});
 expect(deps.create).toHaveBeenCalledTimes(1);expect(deps.send).toHaveBeenCalledTimes(1);
});
it('does not send after an intervening account change',async()=>{
 deps.current.mockReturnValue({uid:'another'});
 await expect(registerEditorialAccount('milo@aproposmagazine.com','fixture',deps)).rejects.toMatchObject({code:'auth/verification-send-failed'});
 expect(deps.send).not.toHaveBeenCalled();
});
