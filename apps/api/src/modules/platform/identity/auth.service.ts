import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantUnitOfWork } from '../../../core/prisma/tenant-unit-of-work.js';
import {
  type AuthSession,
  csrfToken,
  newSessionToken,
  sha256,
} from './auth-session.js';
import { authConfig } from './auth.config.js';
import { AuthRepository, runIdentityQuery } from './auth.repository.js';
import { normalizeUsername } from './normalize-username.js';
import {
  hashPassword,
  isNewPasswordValid,
  isPasswordInput,
  verifyPassword,
} from './password.js';

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function canonicalUsername(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return normalizeUsername(value);
  } catch {
    return null;
  }
}

function requirePasswordChangeCompleted(session: AuthSession): void {
  if (session.view.requiereCambioContrasena) {
    throw new ForbiddenException(
      'Debes cambiar la contraseña antes de continuar.',
    );
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly tenantUnitOfWork: TenantUnitOfWork,
  ) {}

  async login(
    username: unknown,
    password: unknown,
    remoteAddress: string | undefined,
  ) {
    const config = authConfig();
    const canonical = canonicalUsername(username);
    const allowed = await this.repository.allowAttempt(
      sha256(canonical ?? '\0'),
      sha256(remoteAddress ?? '\0'),
    );

    if (!allowed) {
      throw new HttpException(
        'Demasiados intentos. Vuelve a intentarlo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const credential = canonical
      ? await this.repository.findCredential(canonical)
      : undefined;
    const acceptedPassword = isPasswordInput(password);
    const verified = await runIdentityQuery(() =>
      verifyPassword(
        credential?.hash_contrasena ?? null,
        acceptedPassword ? password : '',
      ),
    );

    if (!acceptedPassword || !verified || credential?.estado !== 'ACTIVA') {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const token = newSessionToken();
    const started = await this.repository.startSession(
      credential.cuenta_id,
      credential.version_acceso,
      sha256(token),
      config.idleSeconds,
      config.absoluteSeconds,
    );

    if (!started) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    return this.issuedSession(token);
  }

  async session(token: string): Promise<AuthSession | null> {
    const fingerprint = sha256(token);
    const row = await this.repository.validateSession(
      fingerprint,
      authConfig().idleSeconds,
    );

    return row
      ? {
          fingerprint,
          view: {
            cuentaId: row.cuenta_id,
            juntaId: row.junta_id,
            membresiaId: row.membresia_id,
            ambito: row.ambito,
            rol: row.rol,
            requiereCambioContrasena: row.requiere_cambio,
            csrfToken: csrfToken(token),
          },
        }
      : null;
  }

  async contexts(session: AuthSession) {
    requirePasswordChangeCompleted(session);

    const rows = await this.repository.listContexts(session.fingerprint);
    return rows.map(({ junta_id, nombre, rol }) => ({
      juntaId: junta_id,
      nombre,
      rol,
    }));
  }

  async switchContext(session: AuthSession, requestedJunta: unknown) {
    requirePasswordChangeCompleted(session);

    if (
      requestedJunta !== null &&
      (typeof requestedJunta !== 'string' ||
        requestedJunta.length !== 36 ||
        !uuidPattern.test(requestedJunta))
    ) {
      throw new BadRequestException(
        'Indica un identificador UUID de junta o null para plataforma.',
      );
    }

    const token = newSessionToken();
    const switched = await this.repository.switchSession(
      session.fingerprint,
      sha256(token),
      requestedJunta,
      authConfig().idleSeconds,
    );

    if (!switched) {
      throw new ForbiddenException(
        'El contexto solicitado no está disponible.',
      );
    }

    return this.issuedSession(token);
  }

  async changePassword(
    session: AuthSession,
    currentPassword: unknown,
    newPassword: unknown,
  ) {
    if (!session.view.requiereCambioContrasena) {
      throw new ForbiddenException(
        'La sesión no tiene un cambio inicial de contraseña pendiente.',
      );
    }

    if (!isPasswordInput(currentPassword) || !isNewPasswordValid(newPassword)) {
      throw new BadRequestException(
        'Indica la contraseña actual y una nueva de al menos 12 caracteres y hasta 256 bytes.',
      );
    }

    const credential = await this.repository.ownCredential(session.fingerprint);
    const verified = await runIdentityQuery(() =>
      verifyPassword(credential?.hash_contrasena ?? null, currentPassword),
    );

    if (!verified || credential?.estado !== 'ACTIVA') {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    if (newPassword === currentPassword) {
      throw new BadRequestException(
        'La contraseña nueva debe ser distinta de la actual.',
      );
    }

    const newHash = await runIdentityQuery(() => hashPassword(newPassword));
    const changed = await this.repository.changePassword(
      session.fingerprint,
      credential.version_acceso,
      newHash,
    );

    if (!changed) {
      throw new UnauthorizedException('Sesión inválida.');
    }
  }

  async logout(session: AuthSession): Promise<void> {
    await this.repository.logout(session.fingerprint);
  }

  async ownMembership(session: AuthSession, requestedJunta: string) {
    const { cuentaId, juntaId, membresiaId, rol } = session.view;

    if (!juntaId || !membresiaId || juntaId !== requestedJunta.toLowerCase()) {
      throw new ForbiddenException(
        'La membresía solicitada no está disponible.',
      );
    }

    const row = await runIdentityQuery(() =>
      this.tenantUnitOfWork.run(juntaId, (tx) =>
        this.repository.ownMembership(tx, session.fingerprint),
      ),
    );

    if (
      !row ||
      row.cuenta_id !== cuentaId ||
      row.junta_id !== juntaId ||
      row.membresia_id !== membresiaId ||
      row.rol !== rol
    ) {
      throw new ForbiddenException(
        'La membresía solicitada no está disponible.',
      );
    }

    return { cuentaId, juntaId, membresiaId, rol };
  }

  private async issuedSession(token: string) {
    const session = await this.session(token);

    if (!session) {
      throw new UnauthorizedException('Sesión inválida.');
    }

    return { token, view: session.view };
  }
}
